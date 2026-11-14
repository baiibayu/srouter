import type { ChatMessage, ChatCompletionResponse, ChatCompletionChunk } from '@baiibayu/srouter-shared/types.js';
import type { KeyValidationResult, CompletionOptions } from './base.js';
import type { QuotaObservationContext } from '../services/provider-quota.js';
import { OpenAICompatProvider } from './openai-compat.js';

export const NAVY_BASE_URL = 'https://api.navy/v1';

/**
 * NavyAI — OpenAI-compatible unified API (api.navy/v1).
 *
 * Upstream provides free and paid plans. When the free plan is paused by NavyAI upstream,
 * chat completions return HTTP 403 with code "insufficient_plan". This provider detects
 * the paused state so health checks and router failover handle it gracefully.
 */
export class NavyProvider extends OpenAICompatProvider {
  constructor() {
    super({
      platform: 'navy',
      name: 'NavyAI',
      baseUrl: NAVY_BASE_URL,
      validateUrl: `${NAVY_BASE_URL}/models`,
      extraHeaders: {
        'User-Agent': 'srouter/1.0',
      },
    });
  }

  override async validateKey(apiKey: string, quotaContext?: QuotaObservationContext): Promise<KeyValidationResult> {
    if (!apiKey.trim()) return { valid: false, error: 'NavyAI API key is required' };

    // First check models endpoint
    const modelsResult = await super.validateKey(apiKey, quotaContext);
    if (modelsResult !== true) return modelsResult;

    // Check if free plan is paused upstream by testing a minimal completion probe
    try {
      const res = await this.fetchWithTimeout(`${NAVY_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
          'User-Agent': 'srouter/1.0',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      }, 10000, { timeoutBounds: 'request' });

      if (res.status === 403) {
        const text = await res.text().catch(() => '');
        if (text.includes('insufficient_plan') || text.includes('temporarily paused')) {
          return {
            valid: false,
            error: 'NavyAI free plan is temporarily paused upstream by NavyAI (insufficient_plan). Upgrade or wait for upstream reactivation.',
          };
        }
      }
    } catch {
      // If probe times out or network error, rely on modelsResult
    }

    return true;
  }

  override async chatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext,
  ): Promise<ChatCompletionResponse> {
    try {
      return await super.chatCompletion(apiKey, messages, modelId, options, quotaContext);
    } catch (err: any) {
      if (err?.message?.includes('insufficient_plan') || err?.message?.includes('temporarily paused')) {
        throw Object.assign(
          new Error('NavyAI free plan is temporarily paused upstream by NavyAI (insufficient_plan). Upgrade to a paid plan or use another provider.'),
          { status: 403, cause: err }
        );
      }
      throw err;
    }
  }

  override async *streamChatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext,
  ): AsyncGenerator<ChatCompletionChunk> {
    try {
      for await (const chunk of super.streamChatCompletion(apiKey, messages, modelId, options, quotaContext)) {
        yield chunk;
      }
    } catch (err: any) {
      if (err?.message?.includes('insufficient_plan') || err?.message?.includes('temporarily paused')) {
        throw Object.assign(
          new Error('NavyAI free plan is temporarily paused upstream by NavyAI (insufficient_plan). Upgrade to a paid plan or use another provider.'),
          { status: 403, cause: err }
        );
      }
      throw err;
    }
  }
}
