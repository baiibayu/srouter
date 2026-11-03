import { OpenAICompatProvider } from './openai-compat.js';
import { isAnonymousCredential } from '../lib/credential.js';
import type { ChatMessage, ChatCompletionResponse } from '@baiibayu/srouter-shared/types.js';
import type { CompletionOptions } from './base.js';
import type { QuotaObservationContext } from '../services/provider-quota.js';

/**
 * Nous Portal (Nous Research) - Unified subscription gateway at inference-api.nousresearch.com.
 *
 * Provides access to 300+ frontier models via single OAuth subscription.
 * Free tier available with :free suffix models.
 * 
 * Anti-ban strategy:
 * - Uses device code OAuth for proper token rotation
 * - Implements request throttling and jitter
 * - Rotates between free models to distribute load
 * - Handles 401/402 errors with automatic token refresh
 * - Respects rate limits per model
 */
export class NousProvider extends OpenAICompatProvider {
  constructor() {
    super({
      platform: 'nous',
      name: 'Nous Portal',
      baseUrl: 'https://inference-api.nousresearch.com/v1',
      keyless: false, // Requires OAuth token
    });
  }

  override async fetchModelCatalog(_apiKey: string): Promise<Response> {
    const models = [
      { id: 'stepfun/step-3.7-flash:free', object: 'model' },
      { id: 'upstage/solar-mini4:free', object: 'model' },
      { id: 'reflection/beam-1.0-501b-a23b:free', object: 'model' },
      { id: 'ornith/ornith-1.5-122b:free', object: 'model' },
    ];
    return new Response(JSON.stringify({ object: 'list', data: models }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  protected customHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Nous-SRouter/1.0',
      'X-Client': 'SRouter',
    };
    if (!isAnonymousCredential(apiKey)) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    return headers;
  }

  override async validateKey(apiKey: string): Promise<boolean> {
    if (isAnonymousCredential(apiKey)) {
      return false;
    }
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.customHeaders(apiKey),
      }, 15000);
      return res.ok;
    } catch {
      return false;
    }
  }

  override async chatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext
  ): Promise<ChatCompletionResponse> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await super.chatCompletion(apiKey, messages, modelId, options, quotaContext);
        if (res.choices?.[0]?.message?.content === '' || res.choices?.[0]?.message?.content === null) {
          throw new Error('Empty completion from provider');
        }
        return res;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
    }
    throw lastError || new Error('Max retries exceeded');
  }
}
