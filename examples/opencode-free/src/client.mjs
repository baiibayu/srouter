/**
 * Minimal OpenCode free-tier client — the whole adapter, ~150 lines.
 *
 * Upstream only speaks streaming: the gate requires `stream: true`, so a
 * non-streaming caller is served by consuming the SSE frames and assembling
 * one Chat Completions response here.
 */

import {
  USER_AGENT,
  toSessionId,
  withGateTools,
  notePlaceholderTools,
  retargetToolChoice,
  restoreToolNames,
} from './fingerprint.mjs';

/** `/inference/v1` is the v2 CLI path; `/zen/v1` still answers the same way. */
export const DEFAULT_BASE_URL = 'https://opencode.ai/inference/v1';

export class OpenCodeFreeClient {
  /**
   * @param {object} [options]
   * @param {string} [options.baseUrl]   override the upstream root
   * @param {string} [options.sessionId] stable per conversation (see toSessionId)
   * @param {number} [options.timeoutMs] per-request deadline
   */
  constructor({ baseUrl = DEFAULT_BASE_URL, sessionId, timeoutMs = 60_000 } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.sessionId = toSessionId(sessionId);
    this.timeoutMs = timeoutMs;
  }

  /** Session id actually used on the wire (12-hex form, not the caller's seed). */
  get session() {
    return this.sessionId;
  }

  headers() {
    // The gate reads the UA prefix and the session shape. Both session names
    // are sent because the real CLI does; `-id` alone also passes.
    return {
      'Content-Type': 'application/json',
      Authorization: 'Bearer public',
      'User-Agent': USER_AGENT,
      'x-opencode-client': 'cli',
      'x-opencode-session': this.sessionId,
      'x-opencode-session-id': this.sessionId,
      Accept: 'text/event-stream',
    };
  }

  /** Build the upstream body from Chat Completions arguments. */
  buildBody({ model, messages, temperature, max_tokens, tools, tool_choice }) {
    const { tools: wireTools, aliases, appended } = withGateTools(tools);

    const body = {
      model,
      messages: notePlaceholderTools(messages, appended),
      stream: true, // mandatory: `stream: false` is answered 403 FreeTierError
      tools: wireTools,
    };
    if (temperature !== undefined) body.temperature = temperature;
    if (max_tokens !== undefined) body.max_tokens = max_tokens;
    // Never `tool_choice: "none"` — upstream demotes it to a 403.
    const choice = retargetToolChoice(tool_choice, aliases);
    if (choice !== undefined) body.tool_choice = choice;

    return { body, aliases };
  }

  async request(payload) {
    const { body, aliases } = this.buildBody(payload);
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw await upstreamError(res, text);
    }
    return { res, aliases };
  }

  /**
   * Stream deltas. Yields the upstream ChatCompletionChunk objects as they
   * arrive; alias restoration is applied per frame so a caller that only
   * streams sees its own tool names too.
   */
  async *stream(payload) {
    const { res, aliases } = await this.request(payload);
    for await (const chunk of readSse(res)) {
      yield aliases.size
        ? restoreStreamToolNames(chunk, aliases)
        : chunk;
    }
  }

  /**
   * Assemble the SSE stream into one Chat Completion. Tool-call deltas arrive
   * as fragments keyed by `index`, so they are concatenated here — the shape
   * the OpenAI SDKs expect from a non-streaming call.
   */
  async complete(payload) {
    const { res, aliases } = await this.request(payload);

    let id = '';
    let model = payload.model;
    let created = Math.floor(Date.now() / 1000);
    let content = '';
    let reasoning = '';
    let finishReason = null;
    const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const toolCalls = new Map();

    for await (const chunk of readSse(res)) {
      if (chunk.id) id = chunk.id;
      if (chunk.model) model = chunk.model;
      if (chunk.created) created = chunk.created;
      if (chunk.usage) {
        usage.prompt_tokens = chunk.usage.prompt_tokens ?? usage.prompt_tokens;
        usage.completion_tokens = chunk.usage.completion_tokens ?? usage.completion_tokens;
        usage.total_tokens = chunk.usage.total_tokens ?? usage.total_tokens;
      }
      for (const choice of chunk.choices ?? []) {
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice.delta ?? {};
        if (delta.content) content += delta.content;
        if (delta.reasoning_content) reasoning += delta.reasoning_content;
        for (const call of delta.tool_calls ?? []) {
          const index = call.index ?? toolCalls.size;
          if (!toolCalls.has(index)) {
            toolCalls.set(index, {
              id: call.id ?? `call_${index}`,
              type: 'function',
              function: { name: '', arguments: '' },
            });
          }
          const slot = toolCalls.get(index);
          if (call.id) slot.id = call.id;
          if (call.function?.name) slot.function.name += call.function.name;
          if (call.function?.arguments) slot.function.arguments += call.function.arguments;
        }
      }
    }

    const message = {
      role: 'assistant',
      content: content || null,
      ...(toolCalls.size ? { tool_calls: [...toolCalls.values()] } : {}),
      ...(reasoning ? { reasoning_content: reasoning } : {}),
    };

    const response = {
      id: id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created,
      model,
      choices: [{ index: 0, message, finish_reason: finishReason ?? 'stop' }],
      usage,
    };
    return restoreToolNames(response, aliases);
  }

  /** Model ids the free roster currently advertises. No gate on this route. */
  async listModels() {
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: { Authorization: 'Bearer public' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw await upstreamError(res, await res.text().catch(() => ''));
    const body = await res.json();
    return (body.data ?? []).map((m) => m.id);
  }
}

/** Parse an upstream SSE body into ChatCompletionChunk objects. */
async function* readSse(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data);
        } catch {
          // A keep-alive or comment frame: not a chunk, keep reading.
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/** Restore alias names in a streamed delta. */
function restoreStreamToolNames(chunk, aliases) {
  let changed = false;
  const choices = (chunk.choices ?? []).map((choice) => {
    const calls = choice.delta?.tool_calls;
    if (!Array.isArray(calls)) return choice;
    return {
      ...choice,
      delta: {
        ...choice.delta,
        tool_calls: calls.map((call) => {
          const original = aliases.get(call?.function?.name);
          if (!original) return call;
          changed = true;
          return { ...call, function: { ...call.function, name: original } };
        }),
      },
    };
  });
  return changed ? { ...chunk, choices } : chunk;
}

/** Turn an upstream error frame into an Error that names the cause. */
async function upstreamError(res, text) {
  let type = '';
  let message = '';
  try {
    const parsed = JSON.parse(text);
    type = parsed?.error?.type ?? '';
    message = parsed?.error?.message ?? '';
  } catch {
    // Non-JSON body: the status and raw text are all there is.
  }

  const retryAfter = res.headers.get('retry-after');
  const err = new Error(
    `${res.status} ${type || 'HTTP error'}${message ? `: ${message}` : ''}` +
    (retryAfter ? ` (retry-after ${retryAfter}s)` : ''),
  );
  err.status = res.status;
  err.type = type;
  if (retryAfter) err.retryAfterSeconds = Number(retryAfter);

  if (type === 'FreeTierError') {
    err.hint = 'The free-tier gate rejected the request. The session must be ' +
      'ses_<12 hex><14 base62>, a tool named `read` must be declared, ' +
      'stream must be true, and the User-Agent must start with `opencode/`.';
  } else if (type === 'FreeUsageLimitError') {
    err.hint = 'Rate limited. Wait for retry-after, or reuse one session id ' +
      'across a conversation instead of minting a new one per request.';
  }
  return err;
}
