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

const USER_AGENT =
  'opencode/1.18.31 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14';

// -- Session / Request ID generation ----------------------------------------

const BASE62 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

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
  return `ses_${cryptoHex(6)}${cryptoBase62(14)}`;
}
function genRequestId(): string {
  return `msg_${cryptoHex(6)}${cryptoBase62(14)}`;
}

// -- Fingerprint tools ------------------------------------------------------
// The free-tier gate demands these four tools in body.tools.

const FINGERPRINT_QUARTET = [
  { name: 'bash', description: 'OpenCode built-in bash tool' },
  { name: 'glob', description: 'OpenCode built-in glob tool' },
  { name: 'grep', description: 'OpenCode built-in grep tool' },
  { name: 'read', description: 'OpenCode built-in read tool' },
];

function fpTool(name: string, description: string) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties: {} },
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
      (body.tools as unknown[]).push(fpTool(fp.name, fp.description));
      present.add(fp.name);
    }
  }

  if (callerCount === 0 && !body.tool_choice) {
    body.tool_choice = 'none';
  }
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

  private identityHeaders(): Record<string, string> {
    return {
      'Authorization': 'Bearer public',
      'User-Agent': USER_AGENT,
      'x-opencode-client': 'desktop',
      'x-opencode-session': genSessionId(),
      'x-opencode-request': genRequestId(),
      'x-opencode-project': 'global',
      'Accept': 'text/event-stream',
    };
  }

  // -- Key validation ----------------------------------------------------
  // Always succeeds (keyless). A lightweight models-list call validates
  // network connectivity to the upstream.

  async validateKey(
    _apiKey: string,
    _quotaContext?: QuotaObservationContext,
  ): Promise<KeyValidationResult> {
    try {
      const res = await this.fetchWithTimeout(
        `${UPSTREAM_BASE}/models`,
        { method: 'GET', headers: this.identityHeaders() },
        10_000,
        { timeoutBounds: 'request' },
      );
      if (res.ok || res.status === 404) return true;
      return { valid: false, error: `OpenCode Free models probe returned HTTP ${res.status}` };
    } catch (e: any) {
      return { valid: false, error: `OpenCode Free network error: ${e?.message ?? e}` };
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
  ): Promise<Response> {
    const timeout = options?.timeoutMs ?? CHAT_TIMEOUT_MS;
    const res = await this.fetchWithTimeout(
      `${UPSTREAM_BASE}/chat/completions`,
      {
        method: 'POST',
        headers: {
          ...this.identityHeaders(),
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
    _apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext,
  ): Promise<ChatCompletionResponse> {
    const body = this.buildBody(messages, modelId, options);
    const res = await this.fetchChat(body, options);

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
    _apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext,
  ): AsyncGenerator<ChatCompletionChunk> {
    const body = this.buildBody(messages, modelId, options);
    const res = await this.fetchChat(body, options);

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
