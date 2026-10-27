import type {
  ChatCompletionChunk,
  ChatCompletionResponse,
  ChatMessage,
  ChatToolCall,
} from '@baiibayu/srouter-shared/types.js';
import {
  BaseProvider,
  providerHttpError,
  type CompletionOptions,
  type KeyValidationResult,
} from './base.js';
import { resolveMaxTokens } from '../lib/sampling-params.js';
import { providerTimeoutMs } from '../lib/provider-timeout.js';
import { recordQuotaObservationsFromResponse, type QuotaObservationContext } from '../services/provider-quota.js';
import { extractThinkFromMessage } from '../lib/think-tags.js';
import { isAnonymousCredential } from '../lib/credential.js';

// -- OpenCode Free Tier Identity --------------------------------------------
//
// Since 2026-09, OpenCode's zen free tier (Bearer public) rejects requests
// that don't look like the official OpenCode CLI. The gate checks:
//
//   1. User-Agent: opencode/<major.minor[.patch]> with version >= 1.17
//   2. stream: true  (stream:false => 403 FreeTierError)
//   3. tools must include the fingerprint quartet: bash, glob, grep, read
//   4. Authorization: Bearer public
//
// Additional headers improve fidelity: x-opencode-client, x-opencode-session,
// x-opencode-request, x-opencode-project. This adapter spoofs all of them.

const UPSTREAM_BASE = 'https://opencode.ai/zen/v1';

const USER_AGENT = 'opencode/1.19.0';

// -- Session / Request ID generation ----------------------------------------

const BASE62 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// Zen timestamp encoding: descending time so the newest IDs sort first.
// The official OpenCode CLI uses this scheme; the free-tier gate checks it.
const SESSION_PREFIX_MASK = (1n << 48n) - 1n;

function descendingTimeHex(time: number, counterValue: number): string {
  return (~(BigInt(time) * 0x1000n + BigInt(counterValue)) & SESSION_PREFIX_MASK)
    .toString(16)
    .padStart(12, '0');
}

function cryptoHex(n: number): string {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function cryptoBase62(n: number): string {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => BASE62[x % 62]).join('');
}

function genSessionId(): string {
  return `ses_${descendingTimeHex(Date.now(), 0)}${cryptoBase62(14)}`;
}
function genRequestId(): string {
  return `msg_${descendingTimeHex(Date.now(), 0)}${cryptoBase62(14)}`;
}

// -- Fingerprint tools ------------------------------------------------------
// The free-tier gate demands these four tools in body.tools.

const FINGERPRINT_QUARTET = [
  { name: 'bash', description: 'OpenCode built-in bash tool', params: { type: 'object', properties: { command: { type: 'string', description: 'The bash command to execute' } }, required: ['command'] } },
  { name: 'glob', description: 'OpenCode built-in glob tool', params: { type: 'object', properties: { pattern: { type: 'string', description: 'Glob pattern to match files' }, path: { type: 'string', description: 'Directory to search in' } }, required: ['pattern'] } },
  { name: 'grep', description: 'OpenCode built-in grep tool', params: { type: 'object', properties: { pattern: { type: 'string', description: 'Regex pattern to search for' }, path: { type: 'string', description: 'File or directory to search in' }, include: { type: 'string', description: 'File include pattern' } }, required: ['pattern'] } },
  { name: 'read', description: 'OpenCode built-in read tool', params: { type: 'object', properties: { filePath: { type: 'string', description: 'Path of the file to read' }, offset: { type: 'number', description: 'Line offset to start reading from' }, limit: { type: 'number', description: 'Number of lines to read' } }, required: ['filePath'] } },
];

function fpTool(name: string, description: string, parameters: Record<string, unknown>) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters,
    },
  };
}

function ensureFingerprintTools(body: Record<string, unknown>): void {
  const present = new Set<string>();
  let callerCount = 0;

  if (Array.isArray(body.tools)) {
    callerCount = body.tools.length;
    for (const t of body.tools) {
      const n = t?.function?.name ?? t?.name;
      if (typeof n === 'string') present.add(n.trim().toLowerCase());
    }
  } else {
    body.tools = [];
  }

  for (const fp of FINGERPRINT_QUARTET) {
    if (!present.has(fp.name)) {
      (body.tools as unknown[]).push(fpTool(fp.name, fp.description, fp.params));
      present.add(fp.name);
    }
  }

  // NEVER set tool_choice to 'none' — the free-tier gate 403s on it.
  // Leave it undefined so the upstream decides.
}
// -- Provider ---------------------------------------------------------------

const CHAT_TIMEOUT_MS = providerTimeoutMs('opencode-free', 60_000);

/**
 * OpenCode Free � keyless provider that spoofs the official OpenCode CLI
 * identity to access the zen free tier without a real API key.
 *
 * The upstream ALWAYS requires stream: true; stream: false or omitted
 * results in 403 FreeTierError.  Non-streaming callers get a synthetic
 * single-chunk response assembled from the SSE stream.
 */
export class OpenCodeFreeProvider extends BaseProvider {
  readonly platform = 'opencode-free' as const;
  readonly name = 'OpenCode Free';
  override keyless = true;

  // -- Auth headers ------------------------------------------------------

  private identityHeaders(apiKey?: string): Record<string, string> {
    const auth = (apiKey && apiKey.trim() && apiKey !== 'keyless' && !apiKey.startsWith('sr-'))
      ? (apiKey.startsWith('Bearer ') ? apiKey.trim() : `Bearer ${apiKey.trim()}`)
      : 'Bearer public';

    const sessionId = genSessionId();
    return {
      'Authorization': auth,
      'User-Agent': USER_AGENT,
      'x-opencode-client': 'cli',
      'x-opencode-session': sessionId,
      'x-opencode-session-id': sessionId,
      'x-opencode-request': genRequestId(),
      'x-opencode-project': 'global',
      'Accept': 'text/event-stream',
    };
  }

  // -- Key validation ----------------------------------------------------
  // Always succeeds (keyless). A lightweight models-list call validates
  // network connectivity to the upstream.

  async validateKey(
    apiKey: string,
    _quotaContext?: QuotaObservationContext,
  ): Promise<KeyValidationResult> {
    // Keyless path: the sentinel ('no-key' / '' / 'keyless') is the anonymous
    // public-tier credential. The upstream /models endpoint answers 401 to
    // `Bearer no-key` (it is not a real key), so validating it would flip the
    // row to status='invalid' and take the whole platform out of rotation.
    // A keyless provider is always valid by definition - real traffic is the
    // only thing that can prove the tier is reachable.
    if (isAnonymousCredential(apiKey)) {
      return true;
    }
    try {
      const res = await this.fetchWithTimeout(
        `${UPSTREAM_BASE}/models`,
        { method: 'GET', headers: this.identityHeaders(apiKey) },
        10_000,
        { timeoutBounds: 'request' },
      );
      if (res.ok || (res.status >= 300 && res.status < 400) || res.status === 404 || res.status === 429) return true;
      if (res.status === 401 || res.status === 403) {
        return { valid: false, error: `OpenCode Free authentication failed (${res.status})` };
      }
      return true;
    } catch (e: any) {
      // Network/DNS failure must NOT disable the platform.
      console.warn(`[opencode-free] validateKey network error (keeping keyless platform enabled): ${e?.message ?? e}`);
      return true;
    }
  }

  // -- Build the upstream body -------------------------------------------

  private buildBody(
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: modelId,
      messages,
      temperature: options?.temperature ?? 0.7,
      stream: true,           // mandatory � upstream 403s without it
      store: false,
    };
    if (options?.top_p !== undefined) body.top_p = options.top_p;
    if (options?.tools) body.tools = options.tools;
    if (options?.tool_choice) body.tool_choice = options.tool_choice;
    if (options?.parallel_tool_calls !== undefined) {
      body.parallel_tool_calls = options.parallel_tool_calls;
    }
    const resolved = resolveMaxTokens(this.platform, options?.max_tokens, options?.contextBudget);
    if (resolved !== null) body.max_tokens = resolved;

    ensureFingerprintTools(body);
    return body;
  }

  // -- Shared fetch ------------------------------------------------------

  private async fetchChat(
    body: Record<string, unknown>,
    options?: CompletionOptions,
    apiKey?: string,
  ): Promise<Response> {
    const timeout = options?.timeoutMs ?? CHAT_TIMEOUT_MS;
    const res = await this.fetchWithTimeout(
      `${UPSTREAM_BASE}/chat/completions`,
      {
        method: 'POST',
        headers: {
          ...this.identityHeaders(apiKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      timeout,
      { signal: options?.signal, timeoutBounds: 'headers' },
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw providerHttpError(
        res,
        `OpenCode Free HTTP ${res.status}: ${errBody.slice(0, 300)}`,
        errBody,
      );
    }

    return res;
  }

  // -- Non-streaming completion ------------------------------------------
  // Reads the SSE stream, assembles a single response.

  async chatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext,
  ): Promise<ChatCompletionResponse> {
    const body = this.buildBody(messages, modelId, options);
    const res = await this.fetchChat(body, options, apiKey);

    recordQuotaObservationsFromResponse(res, {
      platform: this.platform,
      keyId: quotaContext?.keyId,
      providerAccountId: quotaContext?.providerAccountId,
      modelId,
      quotaPoolKey: quotaContext?.quotaPoolKey,
      endpoint: 'chat/completions',
    });

    const chunks: ChatCompletionChunk[] = [];
    for await (const chunk of this.readSseStream(res)) {
      chunks.push(chunk);
    }
    return this.assembleResponse(modelId, chunks);
  }

  // -- Streaming completion ----------------------------------------------

  async *streamChatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext,
  ): AsyncGenerator<ChatCompletionChunk> {
    const body = this.buildBody(messages, modelId, options);
    const res = await this.fetchChat(body, options, apiKey);

    recordQuotaObservationsFromResponse(res, {
      platform: this.platform,
      keyId: quotaContext?.keyId,
      providerAccountId: quotaContext?.providerAccountId,
      modelId,
      quotaPoolKey: quotaContext?.quotaPoolKey,
      endpoint: 'chat/completions',
    });

    yield* this.readSseStream(res);
  }

  // -- Stream -> single response assembler -------------------------------

  private assembleResponse(
    modelId: string,
    chunks: ChatCompletionChunk[],
  ): ChatCompletionResponse {
    let content = '';
    let finishReason: string | null = null;
    let reasoningContent: string | null = null;
    let model = modelId;
    const toolCalls = new Map<
      number,
      { id: string; type: 'function'; function: { name: string; arguments: string } }
    >();
    const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    for (const chunk of chunks) {
      if (chunk.model) model = chunk.model;
      if (chunk.usage) {
        usage.prompt_tokens += chunk.usage.prompt_tokens ?? 0;
        usage.completion_tokens += chunk.usage.completion_tokens ?? 0;
        usage.total_tokens += chunk.usage.total_tokens ?? 0;
      }
      for (const choice of chunk.choices ?? []) {
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice.delta;
        if (!delta) continue;
        if (delta.content) content += delta.content;
        if ((delta as any).reasoning_content) {
          reasoningContent = (delta as any).reasoning_content as string;
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = (tc as any).index ?? toolCalls.size;
            if (!toolCalls.has(idx)) {
              toolCalls.set(idx, {
                id: tc.id ?? `call_${idx}`,
                type: 'function',
                function: { name: tc.function?.name ?? '', arguments: '' },
              });
            }
            const existing = toolCalls.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.function.name += tc.function.name;
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
          }
        }
      }
    }

    const message: ChatCompletionResponse['choices'][0]['message'] = {
      role: 'assistant',
      content: content || null,
      ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
      ...(toolCalls.size > 0
        ? { tool_calls: Array.from(toolCalls.values()) as ChatToolCall[] }
        : {}),
    };
    extractThinkFromMessage(message);

    return {
      id: `free-${Date.now()}-${cryptoHex(4)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message, finish_reason: finishReason as any }],
      usage,
      _routed_via: { platform: 'opencode-free', model: modelId },
    };
  }
}
