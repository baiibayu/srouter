import https from 'node:https';
import { Readable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
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
// OpenCode's free tier (Bearer public) checks:
//   1. TLS ClientHello cipher list (BoringSSL/Bun cipher list hash)
//   2. User-Agent: opencode/latest/<version>/cli (or >= 1.17)
//   3. stream: true (mandatory; stream: false => 403 FreeTierError)
//   4. tools must include the fingerprint definitions: read, shell
//   5. system prompt must carry the CLI `<env>` marker
//   6. Authorization: Bearer public
//   7. Session & request headers (x-opencode-client, x-opencode-session, etc.)

const UPSTREAM_BASE = 'https://opencode.ai/inference/v1';

const USER_AGENT = 'opencode/latest/2.0.26/cli';

// BoringSSL/Chrome cipher list required by upstream to avoid fake 429 FreeUsageLimitError
const OPENCODE_CIPHER_LIST = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-ECDSA-AES128-SHA',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-ECDSA-AES256-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA',
].join(':');

// -- Session / Request ID generation ----------------------------------------

const BASE62 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

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

let sessionCounter = 0;
let lastSessionTime = 0;

function genSessionId(): string {
  const now = Date.now();
  if (now !== lastSessionTime) {
    lastSessionTime = now;
    sessionCounter = 0;
  }
  sessionCounter++;
  return `ses_${descendingTimeHex(now, sessionCounter)}${cryptoBase62(14)}`;
}

let requestCounter = 0;
let lastRequestTime = 0;

function genRequestId(): string {
  const now = Date.now();
  if (now !== lastRequestTime) {
    lastRequestTime = now;
    requestCounter = 0;
  }
  requestCounter++;
  return `msg_${descendingTimeHex(now, requestCounter)}${cryptoBase62(14)}`;
}

// -- Environment Prompt Fingerprint -----------------------------------------

const ENV_TAG = '<env>';
const ENV_HEADING = 'Here is some useful information about the environment you are running in:';
const ENV_TMP_DIR = path.join(os.tmpdir(), 'opencode');
const ENV_WORKING_DIR = process.cwd();

const ENV_FINGERPRINT_PROMPT = [
  ENV_HEADING,
  ENV_TAG,
  `  Working directory: ${ENV_WORKING_DIR}`,
  `  Workspace root folder: ${ENV_WORKING_DIR}`,
  '  Is directory a git repo: no',
  `  Platform: ${process.platform}`,
  `  Prefer ${ENV_TMP_DIR} over generic system temporary directories such as /tmp; it is pre-created and approved for external access.`,
  '</env>',
].join('\n');

function ensureEnvFingerprintInMessages(messages: ChatMessage[], hasCallerTools = false): ChatMessage[] {
  const placeholderNote = hasCallerTools
    ? '\n\nDo not call the `read` or `shell` tools; they are placeholders that do nothing. Use the other tools you have been given instead.'
    : '';

  const fullPrompt = `${ENV_FINGERPRINT_PROMPT}${placeholderNote}`;

  if (!Array.isArray(messages) || messages.length === 0) {
    return [{ role: 'system', content: fullPrompt }];
  }

  const sysIdx = messages.findIndex((m) => m?.role === 'system');
  if (sysIdx >= 0) {
    const existing = messages[sysIdx];
    const text = typeof existing.content === 'string' ? existing.content : '';
    if (text.includes(ENV_TAG)) {
      return messages;
    }
    const updated = {
      ...existing,
      content: text ? `${text}\n\n${fullPrompt}` : fullPrompt,
    };
    return messages.map((m, i) => (i === sysIdx ? updated : m));
  }

  return [{ role: 'system', content: fullPrompt }, ...messages];
}

// -- Fingerprint tools ------------------------------------------------------

const FINGERPRINT_TOOLS = [
  {
    name: 'read',
    description: 'Read the contents of a file or directory. Supports text files, images, and PDFs. Images and PDFs are presented directly to the model. Each text line is prefixed by its 1-based line number as <line>: <content>. The prefix is for reference and is not part of the file content. Directory entries are returned one per line. Use offset and limit to read large files or directories in sections. Prefer one larger read over many small slices, and use grep to find specific content in large files.',
    params: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to read' },
        offset: { type: 'integer', minimum: 0, description: 'The line or directory entry to start reading from (1-based)' },
        limit: { type: 'integer', minimum: 0, description: 'The maximum number of lines or directory entries to read (defaults to and capped at 2000)' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'shell',
    description: 'Commands run on Linux using bash. Quote file paths containing spaces or special characters. Prefer dedicated tools over shell commands when possible. When output is large, the full result is saved to a file and a truncated preview is returned. Rely on automatic truncation unless filtering the output is more useful. Commands accept an optional timeout, background commands have no timeout by default. Background commands return immediately, and you will be notified when they complete.',
    params: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command string to execute' },
        workdir: { type: 'string', description: 'Working directory to execute the command in. Defaults to the current working directory. When possible, avoid changing directories in the command and set the working directory here instead.' },
        timeout: { type: 'integer', minimum: 0, description: 'Timeout in milliseconds. Set to 0 to disable the timeout. Defaults to 120000 for foreground commands. Background commands have no timeout by default.' },
        background: { type: 'boolean', description: 'Run the command in the background and return immediately (useful for dev servers and long-running builds). You do not need to use \'&\' at the end of the command when using this parameter. You will be notified when it completes. DO NOT poll for completion.' },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
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

function ensureFingerprintTools(body: Record<string, unknown>): boolean {
  const present = new Set<string>();
  let hasCallerTools = false;

  if (Array.isArray(body.tools)) {
    for (const t of body.tools as Array<{ function?: { name?: string }; name?: string }>) {
      const n = t?.function?.name ?? t?.name;
      if (typeof n === 'string') {
        const lower = n.trim().toLowerCase();
        present.add(lower);
        if (lower !== 'read' && lower !== 'shell') {
          hasCallerTools = true;
        }
      }
    }
  } else {
    body.tools = [];
  }

  for (const fp of FINGERPRINT_TOOLS) {
    if (!present.has(fp.name)) {
      (body.tools as unknown[]).push(fpTool(fp.name, fp.description, fp.params));
      present.add(fp.name);
    }
  }

  // Upstream Free tier requires auto tool_choice when tools are passed
  if (!body.tool_choice) {
    body.tool_choice = 'auto';
  }

  return hasCallerTools;
}

// -- Model Name Normalization -----------------------------------------------

export function normalizeUpstreamModelId(modelId: string): string {
  let m = modelId.trim();
  if (m === 'oc-deepseek-v4.1-flash' || m === 'deepseek-v4.1-flash') {
    return 'deepseek-v4.1-flash-free';
  }
  if (m.startsWith('oc/')) m = m.slice(3);
  if (m.startsWith('oc-')) m = m.slice(3);
  if (!m.endsWith('-free') && !['big-pickle', 'jev-1.13'].includes(m)) {
    return `${m}-free`;
  }
  return m;
}

// -- TLS Fetch (Impersonates BoringSSL ClientHello) -------------------------

async function tlsFetch(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method || 'GET',
        headers: options.headers || {},
        ciphers: OPENCODE_CIPHER_LIST,
        timeout: options.timeoutMs ?? 60_000,
      },
      (res) => {
        const webStream = Readable.toWeb(res) as ReadableStream<Uint8Array>;
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) {
            v.forEach((val) => headers.append(k, val));
          } else if (v !== undefined) {
            headers.set(k, v);
          }
        }
        resolve(
          new Response(webStream, {
            status: res.statusCode ?? 500,
            statusText: res.statusMessage ?? '',
            headers,
          }),
        );
      },
    );

    if (options.signal) {
      if (options.signal.aborted) {
        req.destroy(new Error('This operation was aborted'));
        return reject(new Error('This operation was aborted'));
      }
      options.signal.addEventListener('abort', () => {
        req.destroy(new Error('This operation was aborted'));
        reject(new Error('This operation was aborted'));
      });
    }

    req.on('timeout', () => {
      req.destroy(new Error(`OpenCode Free request timed out after ${options.timeoutMs ?? 60000}ms`));
      reject(new Error(`OpenCode Free request timed out after ${options.timeoutMs ?? 60000}ms`));
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// -- Provider ---------------------------------------------------------------

const CHAT_TIMEOUT_MS = providerTimeoutMs('opencode-free', 60_000);

/**
 * OpenCode Free — keyless provider that accesses OpenCode's free tier
 * without a real API key by spoofing the official OpenCode CLI identity,
 * fingerprint tools, environment block, and matching BoringSSL cipher list.
 */
export class OpenCodeFreeProvider extends BaseProvider {
  readonly platform = 'opencode-free' as const;
  readonly name = 'OpenCode Free';
  override keyless = true;

  // -- Auth headers ------------------------------------------------------

  private identityHeaders(apiKey?: string): Record<string, string> {
    const isAnon = !apiKey || isAnonymousCredential(apiKey) || apiKey.trim() === 'keyless' || apiKey.startsWith('sr-');
    const auth = isAnon
      ? 'Bearer public'
      : (apiKey.startsWith('Bearer ') ? apiKey.trim() : `Bearer ${apiKey.trim()}`);

    const sessionId = genSessionId();
    return {
      'Authorization': auth,
      'User-Agent': USER_AGENT,
      'x-opencode-client': 'cli',
      'x-opencode-session': sessionId,
      'x-opencode-session-id': sessionId,
      'x-session-affinity': sessionId,
      'x-session-id': sessionId,
      'x-opencode-request': genRequestId(),
      'x-opencode-project': 'global',
      'Accept': 'text/event-stream',
    };
  }

  // -- Key validation ----------------------------------------------------

  async validateKey(
    apiKey: string,
    _quotaContext?: QuotaObservationContext,
  ): Promise<KeyValidationResult> {
    if (isAnonymousCredential(apiKey)) {
      return true;
    }
    try {
      const res = await tlsFetch(`${UPSTREAM_BASE}/models`, {
        method: 'GET',
        headers: this.identityHeaders(apiKey),
        timeoutMs: 10_000,
      });
      if (res.ok || (res.status >= 300 && res.status < 400) || res.status === 404 || res.status === 429) return true;
      if (res.status === 401 || res.status === 403) {
        return { valid: false, error: `OpenCode Free authentication failed (${res.status})` };
      }
      return true;
    } catch (e: any) {
      console.warn(`[opencode-free] validateKey network error: ${e?.message ?? e}`);
      return true;
    }
  }

  // -- Build the upstream body -------------------------------------------

  private buildBody(
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
  ): Record<string, unknown> {
    const upstreamModel = normalizeUpstreamModelId(modelId);
    const body: Record<string, unknown> = {
      model: upstreamModel,
      temperature: options?.temperature ?? 0.7,
      stream: true,
      store: false,
    };
    if (options?.top_p !== undefined) body.top_p = options.top_p;
    if (options?.tools) body.tools = [...options.tools];
    if (options?.tool_choice) body.tool_choice = options.tool_choice;
    if (options?.parallel_tool_calls !== undefined) {
      body.parallel_tool_calls = options.parallel_tool_calls;
    }
    const resolved = resolveMaxTokens(this.platform, options?.max_tokens, options?.contextBudget);
    if (resolved !== null) body.max_tokens = resolved;

    const hasCallerTools = ensureFingerprintTools(body);
    body.messages = ensureEnvFingerprintInMessages(messages, hasCallerTools);

    return body;
  }

  // -- Shared fetch ------------------------------------------------------

  private async fetchChat(
    body: Record<string, unknown>,
    options?: CompletionOptions,
    apiKey?: string,
  ): Promise<Response> {
    const timeout = options?.timeoutMs ?? CHAT_TIMEOUT_MS;
    const url = `${UPSTREAM_BASE}/chat/completions`;
    const headers = {
      ...this.identityHeaders(apiKey),
      'Content-Type': 'application/json',
    };
    const bodyStr = JSON.stringify(body);

    let res: Response;
    try {
      res = await tlsFetch(url, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: options?.signal,
        timeoutMs: timeout,
      });
    } catch (tlsErr: any) {
      // Fallback to fetchWithTimeout
      res = await this.fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
          body: bodyStr,
        },
        timeout,
        { signal: options?.signal, timeoutBounds: 'headers' },
      );
    }

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
