import { OpenAICompatProvider } from './openai-compat.js';
import { isAnonymousCredential } from '../lib/credential.js';
import type { ChatMessage, ChatCompletionResponse, ChatCompletionChunk } from '@baiibayu/srouter-shared/types.js';
import type { CompletionOptions, KeyValidationResult } from './base.js';
import type { QuotaObservationContext } from '../services/provider-quota.js';

/**
 * Puter AI (api.puter.com) - Official Puter AI Driver Interface.
 *
 * Supports dual-mode:
 * 1. Keyless mode: Allows free tier exploration / guest attempts.
 * 2. Authenticated mode: Accepts personal auth token from puter.com/dashboard#account.
 *
 * Uses official Puter AI Driver protocol (interface: "puter-chat-completion", driver: "ai-chat", method: "complete").
 */
export class PuterProvider extends OpenAICompatProvider {
  constructor() {
    super({
      platform: 'puter',
      name: 'Puter AI',
      baseUrl: 'https://api.puter.com',
      keyless: false, // Requires Puter personal auth token
    });
  }

  protected customHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Origin': 'https://puter.com',
      'Referer': 'https://puter.com/',
      'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
    };

    if (!isAnonymousCredential(apiKey) && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    return headers;
  }

  override async fetchModelCatalog(apiKey: string): Promise<Response> {
    try {
      const res = await fetch(`${this.baseUrl}/puterai/chat/models/details`, {
        headers: this.customHeaders(apiKey),
      });
      if (res.ok) {
        const data = await res.json() as { models?: Array<{ id: string }> };
        if (Array.isArray(data?.models) && data.models.length > 0) {
          const list = data.models.map(m => ({ id: m.id, object: 'model' }));
          return new Response(JSON.stringify({ object: 'list', data: list }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    } catch {}

    const fallbackModels = [
      { id: 'deepseek-chat', object: 'model' },
      { id: 'deepseek/deepseek-chat', object: 'model' },
      { id: 'gpt-4o-mini', object: 'model' },
      { id: 'openai/gpt-4o-mini', object: 'model' },
      { id: 'gpt-4o', object: 'model' },
      { id: 'claude-3-5-sonnet', object: 'model' },
      { id: 'claude-3-7-sonnet', object: 'model' },
    ];
    return new Response(JSON.stringify({ object: 'list', data: fallbackModels }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  override async validateKey(apiKey: string, _quotaContext?: QuotaObservationContext): Promise<KeyValidationResult> {
    if (isAnonymousCredential(apiKey) || !apiKey.trim()) {
      return false;
    }
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/drivers/call`, {
        method: 'POST',
        headers: this.customHeaders(apiKey),
        body: JSON.stringify({
          interface: 'puter-chat-completion',
          driver: 'ai-chat',
          test_mode: false,
          method: 'complete',
          args: {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
          },
        }),
      }, 10000);
      if (res.ok) return true;
      if (res.status === 401) {
        return { valid: false, error: 'Invalid or expired Puter Auth Token' };
      }
      return res.status !== 403;
    } catch {
      return true;
    }
  }

  override async chatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    _quotaContext?: QuotaObservationContext
  ): Promise<ChatCompletionResponse> {
    const headers = this.customHeaders(apiKey);

    const body = {
      interface: 'puter-chat-completion',
      driver: 'ai-chat',
      test_mode: false,
      method: 'complete',
      args: {
        model: modelId,
        messages,
        temperature: options?.temperature,
        max_tokens: options?.max_tokens,
        stream: false,
      },
    };

    const res = await this.fetchWithTimeout(`${this.baseUrl}/drivers/call`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }, options?.timeoutMs ?? 60_000, { signal: options?.signal, timeoutBounds: 'request' });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) {
        throw new Error('Puter requires personal token. Open puter.com/dashboard#account or click Get Puter Token.');
      }
      throw new Error(`Puter API error ${res.status}: ${JSON.stringify(err)}`);
    }

    const data = await res.json() as any;
    const result = data?.result;
    const msg = result?.message || data?.message || data?.choices?.[0]?.message;
    const content = typeof msg === 'string' ? msg : (msg?.content || result?.text || '');

    const out: ChatCompletionResponse = {
      id: `chatcmpl-puter-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelId,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: typeof content === 'string' ? content : JSON.stringify(content),
        },
        finish_reason: result?.finish_reason || 'stop',
      }],
      usage: result?.usage ? {
        prompt_tokens: result.usage.prompt || 0,
        completion_tokens: result.usage.completion || 0,
        total_tokens: (result.usage.prompt || 0) + (result.usage.completion || 0),
      } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    out._routed_via = { platform: 'puter', model: modelId };
    return out;
  }

  override async *streamChatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const headers = this.customHeaders(apiKey);

    const body = {
      interface: 'puter-chat-completion',
      driver: 'ai-chat',
      test_mode: false,
      method: 'complete',
      args: {
        model: modelId,
        messages,
        temperature: options?.temperature,
        max_tokens: options?.max_tokens,
        stream: true,
      },
    };

    let res: Response;
    try {
      res = await this.fetchWithTimeout(`${this.baseUrl}/drivers/call`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }, options?.timeoutMs ?? 60_000, { signal: options?.signal, timeoutBounds: 'headers' });
    } catch {
      // Fallback to non-streaming
      const complete = await this.chatCompletion(apiKey, messages, modelId, options, quotaContext);
      const rawContent = complete.choices[0]?.message?.content;
      yield {
        id: complete.id,
        object: 'chat.completion.chunk',
        created: complete.created,
        model: modelId,
        choices: [{
          index: 0,
          delta: { role: 'assistant', content: typeof rawContent === 'string' ? rawContent : '' },
          finish_reason: 'stop',
        }],
      };
      return;
    }

    if (!res.ok || !res.body) {
      // Non-streaming fallback
      const complete = await this.chatCompletion(apiKey, messages, modelId, options, quotaContext);
      const rawContent = complete.choices[0]?.message?.content;
      yield {
        id: complete.id,
        object: 'chat.completion.chunk',
        created: complete.created,
        model: modelId,
        choices: [{
          index: 0,
          delta: { role: 'assistant', content: typeof rawContent === 'string' ? rawContent : '' },
          finish_reason: 'stop',
        }],
      };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const chunkId = `chatcmpl-puter-stream-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.type === 'text' && typeof parsed.text === 'string') {
                yield {
                  id: chunkId,
                  object: 'chat.completion.chunk',
                  created,
                  model: modelId,
                  choices: [{
                    index: 0,
                    delta: { role: 'assistant', content: parsed.text },
                    finish_reason: null,
                  }],
                };
              }
            } catch {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield {
      id: chunkId,
      object: 'chat.completion.chunk',
      created,
      model: modelId,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop',
      }],
    };
  }
}
