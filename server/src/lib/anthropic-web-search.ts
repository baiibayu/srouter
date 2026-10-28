import type { Request, Response } from 'express';
import {
  WEB_SEARCH_TOOL_NAME,
  WEB_SEARCH_FUNCTION_DESCRIPTION,
  WEB_SEARCH_FUNCTION_PARAMETERS,
  hasSearchCapability,
  performWebSearch,
  formatOutcomeForModel,
  encodeHitContent,
  decodeHitContent,
  newServerToolUseId,
  invokeHandlerCaptured,
  copyCapturedHeaders,
  resolveMaxSearches,
  type WebSearchOutcome,
  type DomainFilter,
} from './web-search-tool.js';
import {
  WEB_FETCH_TOOL_NAME,
  WEB_FETCH_ALT_NAME,
  WEB_FETCH_FUNCTION_DESCRIPTION,
  WEB_FETCH_FUNCTION_PARAMETERS,
  isResponsesWebFetchTool,
  performWebFetch,
  formatFetchOutcomeForModel,
  type WebFetchOutcome,
} from './web-fetch-tool.js';

// Anthropic `web_search_*` and `web_fetch_*` server tools (Claude Code's WebSearch & WebFetch)
// served from the gateway's search and fetch pools (#1174).
// The client sees what api.anthropic.com would send: `server_tool_use` + result blocks ahead
// of the answer, usage metadata, and matching SSE events when streaming.
// The routed model only ever sees plain function tools named `web_search` and `web_fetch`;
// each call is executed here and fed back until it answers or client tools run.

const HEARTBEAT_MS = 5_000;

/** `web_search_20250305`, `web_search_20260209`, `web_search_20260318`, … */
export function isWebSearchServerTool(tool: unknown): boolean {
  const type = (tool as { type?: unknown } | null)?.type;
  return typeof type === 'string' && /^web_search_\d{8}$/.test(type);
}

/** `web_fetch`, `web_fetch_20250101`, `fetch_url`, … */
export function isWebFetchServerTool(tool: unknown): boolean {
  if (isResponsesWebFetchTool(tool)) return true;
  const type = (tool as { type?: unknown } | null)?.type;
  return typeof type === 'string' && /^web_fetch(_\d{8})?$/.test(type);
}

type Block = Record<string, any>;

interface Usage { input_tokens: number; output_tokens: number }

function isOurSearchCall(block: Block): boolean {
  return block?.type === 'tool_use' && block?.name === WEB_SEARCH_TOOL_NAME;
}

function isOurFetchCall(block: Block): boolean {
  return block?.type === 'tool_use' && (block?.name === WEB_FETCH_TOOL_NAME || block?.name === WEB_FETCH_ALT_NAME);
}

function resultBlock(toolUseId: string, outcome: WebSearchOutcome): Block {
  if (!outcome.ok) {
    return { type: 'web_search_tool_result', tool_use_id: toolUseId, content: { type: 'web_search_tool_result_error', error_code: outcome.errorCode } };
  }
  return {
    type: 'web_search_tool_result',
    tool_use_id: toolUseId,
    content: outcome.results.map(hit => ({
      type: 'web_search_result',
      url: hit.url,
      title: hit.title || hit.url,
      encrypted_content: encodeHitContent(hit),
      page_age: null,
    })),
  };
}

function fetchResultBlock(toolUseId: string, outcome: WebFetchOutcome): Block {
  if (!outcome.ok) {
    return { type: 'web_fetch_tool_result', tool_use_id: toolUseId, content: { type: 'web_fetch_tool_result_error', error_code: outcome.errorCode } };
  }
  return {
    type: 'web_fetch_tool_result',
    tool_use_id: toolUseId,
    content: {
      type: 'web_fetch_result',
      url: outcome.url,
      title: outcome.title || outcome.url,
      text: outcome.text,
      via: outcome.via,
      truncated: outcome.truncated,
    },
  };
}

/** Earlier search and fetch blocks a client replays → text the routed model can read. */
export function serverToolUseToText(block: Block): string {
  if (block?.name === WEB_SEARCH_TOOL_NAME) {
    const query = typeof block?.input?.query === 'string' ? block.input.query : '';
    return query ? `[Searched the web for: ${query}]` : '';
  }
  if (block?.name === WEB_FETCH_TOOL_NAME || block?.name === WEB_FETCH_ALT_NAME) {
    const url = typeof block?.input?.url === 'string' ? block.input.url : '';
    return url ? `[Fetched page content from: ${url}]` : '';
  }
  return '';
}

export function webSearchResultToText(block: Block): string {
  const content = block?.content;
  if (!Array.isArray(content)) return '[Web search returned an error]';
  if (content.length === 0) return '[Web search returned no results]';
  const lines = ['[Web search results]'];
  for (const hit of content) {
    if (!hit || typeof hit.url !== 'string') continue;
    lines.push(`- ${typeof hit.title === 'string' && hit.title ? hit.title : hit.url} (${hit.url})`);
    const extract = decodeHitContent(hit.encrypted_content);
    if (extract) lines.push(`  ${extract.replace(/\s+/g, ' ').trim()}`);
  }
  return lines.join('\n');
}

export function webFetchResultToText(block: Block): string {
  const content = block?.content;
  if (!content || typeof content !== 'object') return '[Web fetch returned an error]';
  if (content.type === 'web_fetch_tool_result_error') return `[Web fetch error: ${content.error_code ?? 'failed'}]`;
  const title = content.title ? ` (${content.title})` : '';
  const text = typeof content.text === 'string' ? content.text.slice(0, 1000) : '';
  return `[Fetched page content from: ${content.url ?? ''}${title}]\n${text}`;
}

class AnthropicSse {
  private index = 0;
  private started = false;
  private heartbeat: NodeJS.Timeout | null = null;
  constructor(private res: Response) {}

  get committed(): boolean { return this.started; }

  private write(event: string, data: unknown): void {
    if (this.res.writableEnded || this.res.destroyed) return;
    try {
      this.res.write(`event: ${event}\n`);
      this.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch { /* socket teardown race */ }
  }

  start(first: { id: string; model: string }, inputTokens: number): void {
    if (this.started) return;
    this.res.setHeader('Content-Type', 'text/event-stream');
    this.res.setHeader('Cache-Control', 'no-cache');
    this.res.setHeader('Connection', 'keep-alive');
    this.write('message_start', {
      type: 'message_start',
      message: {
        id: first.id, type: 'message', role: 'assistant', model: first.model,
        content: [], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: inputTokens, output_tokens: 0 },
      },
    });
    this.started = true;
    // Searches and follow-up turns can take a while; Anthropic's own stream
    // sends `ping` events, which every SDK ignores but which keep idle
    // watchdogs and proxies from cutting the connection.
    this.heartbeat = setInterval(() => this.write('ping', { type: 'ping' }), HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  block(block: Block): void {
    const idx = this.index++;
    const start = (contentBlock: Block) => this.write('content_block_start', { type: 'content_block_start', index: idx, content_block: contentBlock });
    const delta = (d: Block) => this.write('content_block_delta', { type: 'content_block_delta', index: idx, delta: d });
    switch (block.type) {
      case 'text':
        start({ type: 'text', text: '' });
        if (block.text) delta({ type: 'text_delta', text: block.text });
        break;
      case 'thinking':
        start({ type: 'thinking', thinking: '' });
        if (block.thinking) delta({ type: 'thinking_delta', thinking: block.thinking });
        break;
      case 'tool_use':
      case 'server_tool_use': {
        const { input, ...rest } = block;
        start({ ...rest, input: {} });
        delta({ type: 'input_json_delta', partial_json: JSON.stringify(input ?? {}) });
        break;
      }
      default:
        // web_search_tool_result is delivered whole in content_block_start.
        start(block);
    }
    this.write('content_block_stop', { type: 'content_block_stop', index: idx });
  }

  finish(stopReason: string | null, usage: Record<string, unknown>): void {
    this.stopHeartbeat();
    this.write('message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage });
    this.write('message_stop', { type: 'message_stop' });
    try { this.res.end(); } catch { /* already closed */ }
  }

  fail(message: string): void {
    this.stopHeartbeat();
    this.write('error', { type: 'error', error: { type: 'api_error', message } });
    try { this.res.end(); } catch { /* already closed */ }
  }

  stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}

/**
 * Serve a /v1/messages request that carries a web_search or web_fetch server tool
 * from the search/fetch pool. Returns false (nothing sent) when the request has no
 * such tool or no capability is configured — the caller then runs the normal handler.
 */
export async function maybeServeAnthropicWebSearch(
  handler: (req: Request, res: Response) => Promise<void>,
  req: Request,
  res: Response,
): Promise<boolean> {
  const body = req.body;
  if (!body || typeof body !== 'object' || !Array.isArray(body.tools) || !Array.isArray(body.messages)) return false;
  const searchTool = body.tools.find(isWebSearchServerTool);
  const fetchTool = body.tools.find(isWebFetchServerTool);
  if (!searchTool && !fetchTool) return false;
  if (searchTool && !hasSearchCapability() && !fetchTool) return false;

  const filter: DomainFilter = searchTool ? {
    allowedDomains: Array.isArray(searchTool.allowed_domains) ? searchTool.allowed_domains.filter((d: unknown) => typeof d === 'string') : undefined,
    blockedDomains: Array.isArray(searchTool.blocked_domains) ? searchTool.blocked_domains.filter((d: unknown) => typeof d === 'string') : undefined,
  } : {};
  const maxUses = resolveMaxSearches(searchTool?.max_uses);
  const maxFetches = 5;

  let searchReplaced = false;
  let fetchReplaced = false;
  const tools = body.tools.flatMap((t: Block) => {
    if (isWebSearchServerTool(t)) {
      if (searchReplaced) return [];
      searchReplaced = true;
      return [{ name: WEB_SEARCH_TOOL_NAME, description: WEB_SEARCH_FUNCTION_DESCRIPTION, input_schema: WEB_SEARCH_FUNCTION_PARAMETERS }];
    }
    if (isWebFetchServerTool(t)) {
      if (fetchReplaced) return [];
      fetchReplaced = true;
      return [{ name: WEB_FETCH_TOOL_NAME, description: WEB_FETCH_FUNCTION_DESCRIPTION, input_schema: WEB_FETCH_FUNCTION_PARAMETERS }];
    }
    return [t];
  });

  const wantsStream = body.stream === true;
  const sse = wantsStream ? new AnthropicSse(res) : null;
  const assembled: Block[] = [];
  const usage: Usage = { input_tokens: 0, output_tokens: 0 };
  let searchesRun = 0;
  let searchRequests = 0;
  let fetchesRun = 0;
  let fetchRequests = 0;
  let messages: Block[] = [...body.messages];
  const maxTurns = maxUses + maxFetches + 2;

  const emit = (block: Block) => {
    assembled.push(block);
    sse?.block(block);
  };

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      const lastTurn = turn === maxTurns - 1;
      let toolChoice = body.tool_choice;
      if (turn > 0 && toolChoice && (toolChoice.type === 'any' || (toolChoice.type === 'tool' && (toolChoice.name === WEB_SEARCH_TOOL_NAME || toolChoice.name === WEB_FETCH_TOOL_NAME)))) {
        toolChoice = { type: 'auto' };
      }
      const innerBody = {
        ...body,
        stream: false,
        messages,
        tools,
        ...(toolChoice !== undefined ? { tool_choice: toolChoice } : {}),
      };
      const captured = await invokeHandlerCaptured(handler, req, res, innerBody);
      if (res.writableEnded || res.destroyed) return true;

      if (captured.status !== 200 || captured.body?.type !== 'message') {
        if (sse?.committed) {
          const msg = captured.body?.error?.message ?? `upstream error (HTTP ${captured.status})`;
          sse.fail(String(msg));
        } else {
          copyCapturedHeaders(captured, res);
          res.status(captured.status).json(captured.body);
        }
        return true;
      }

      const reply = captured.body;
      usage.input_tokens += Number(reply.usage?.input_tokens) || 0;
      usage.output_tokens += Number(reply.usage?.output_tokens) || 0;
      copyCapturedHeaders(captured, res);
      if (sse && !sse.committed) sse.start({ id: reply.id, model: reply.model }, Number(reply.usage?.input_tokens) || 0);

      const content: Block[] = Array.isArray(reply.content) ? reply.content : [];
      const searchCalls = content.filter(isOurSearchCall);
      const fetchCalls = content.filter(isOurFetchCall);
      const ourCalls = [...searchCalls, ...fetchCalls];
      const clientCalls = content.filter(b => b?.type === 'tool_use' && !isOurSearchCall(b) && !isOurFetchCall(b));

      // Final turn: no search or fetch requested, a client tool must run first,
      // or the turn budget is spent.
      if (ourCalls.length === 0 || clientCalls.length > 0 || lastTurn) {
        const finalBlocks = content.filter(b => !isOurSearchCall(b) && !isOurFetchCall(b));
        let stopReason = reply.stop_reason ?? 'end_turn';
        if (stopReason === 'tool_use' && clientCalls.length === 0) stopReason = 'end_turn';
        for (const block of finalBlocks) emit(block);
        const finalUsage = {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          server_tool_use: {
            web_search_requests: searchRequests,
            ...(fetchRequests > 0 ? { web_fetch_requests: fetchRequests } : {}),
          },
        };
        if (sse) {
          sse.finish(stopReason, finalUsage);
        } else {
          res.status(200).json({
            id: reply.id,
            type: 'message',
            role: 'assistant',
            model: reply.model,
            content: assembled,
            stop_reason: stopReason,
            stop_sequence: reply.stop_sequence ?? null,
            usage: finalUsage,
          });
        }
        return true;
      }

      // Run this turn's searches and fetches
      const toolResults: Block[] = [];
      for (const block of content) {
        if (!isOurSearchCall(block) && !isOurFetchCall(block)) {
          emit(block);
          continue;
        }
        if (isOurSearchCall(block)) {
          const query = typeof block.input?.query === 'string' ? block.input.query : '';
          let outcome: WebSearchOutcome;
          if (searchesRun >= maxUses) {
            outcome = { ok: false, query, errorCode: 'max_uses_exceeded', message: 'max uses exceeded' };
          } else {
            searchesRun++;
            outcome = await performWebSearch(block.input?.query, filter);
            if (outcome.ok) searchRequests++;
          }
          const serverId = newServerToolUseId();
          emit({ type: 'server_tool_use', id: serverId, name: WEB_SEARCH_TOOL_NAME, input: { query } });
          emit(resultBlock(serverId, outcome));
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: formatOutcomeForModel(outcome) });
        } else if (isOurFetchCall(block)) {
          const url = typeof block.input?.url === 'string' ? block.input.url : '';
          const maxBytes = typeof block.input?.max_bytes === 'number' ? block.input.max_bytes : undefined;
          let outcome: WebFetchOutcome;
          if (fetchesRun >= maxFetches) {
            outcome = { ok: false, url, errorCode: 'fetch_failed', error: 'max fetches exceeded', status: 429 };
          } else {
            fetchesRun++;
            outcome = await performWebFetch(url, maxBytes);
            if (outcome.ok) fetchRequests++;
          }
          const serverId = newServerToolUseId();
          emit({ type: 'server_tool_use', id: serverId, name: WEB_FETCH_TOOL_NAME, input: { url } });
          emit(fetchResultBlock(serverId, outcome));
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: formatFetchOutcomeForModel(outcome) });
        }
      }
      messages = [...messages, { role: 'assistant', content }, { role: 'user', content: toolResults }];
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (sse?.committed) {
      sse.fail(`web search failed: ${message}`);
    } else if (!res.headersSent) {
      res.status(500).json({ type: 'error', error: { type: 'api_error', message: `web search failed: ${message}` } });
    }
    return true;
  } finally {
    sse?.stopHeartbeat();
  }
  return true;
}
