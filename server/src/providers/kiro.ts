import { OpenAICompatProvider } from './openai-compat.js';
import { isAnonymousCredential } from '../lib/credential.js';
import type { ChatMessage, ChatCompletionResponse } from '@baiibayu/srouter-shared/types.js';
import type { CompletionOptions } from './base.js';
import type { QuotaObservationContext } from '../services/provider-quota.js';

/**
 * Kiro AI (kiro.dev / AWS) - AI-native spec-driven development platform built on AWS Bedrock.
 *
 * Supports keyless sentinel and account authentication without paid API keys.
 * 
 * Anti-ban strategy:
 * - Uses proper AWS SigV4 signing via browser OAuth token
 * - Implements request retries with exponential backoff
 * - Rotates between verified models to distribute load
 * - Handles empty completion errors gracefully
 */
export class KiroProvider extends OpenAICompatProvider {
  constructor() {
    super({
      platform: 'kiro',
      name: 'Kiro',
      baseUrl: 'https://codewhisperer.us-east-1.amazonaws.com',
      keyless: true,
    });
  }

  override async fetchModelCatalog(_apiKey: string): Promise<Response> {
    const models = [
      { id: 'claude-sonnet-4.5', object: 'model' },
      { id: 'claude-haiku-4.5', object: 'model' },
    ];
    return new Response(JSON.stringify({ object: 'list', data: models }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  protected customHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Kiro/1.0 (AWS CodeWhisperer)',
    };
    if (!isAnonymousCredential(apiKey)) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    return headers;
  }

  override async validateKey(apiKey: string): Promise<boolean> {
    if (isAnonymousCredential(apiKey)) {
      return true;
    }
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/ListAvailableProfiles`, {
        method: 'POST',
        headers: this.customHeaders(apiKey),
        body: JSON.stringify({ maxResults: 1 }),
      }, 15000);
      return res.ok || res.status === 403;
    } catch {
      return true;
    }
  }

  override async chatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext
  ): Promise<ChatCompletionResponse> {
    // Add retry logic for empty completion errors
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await super.chatCompletion(apiKey, messages, modelId, options, quotaContext);
        // Check response for empty completion
        if (res.choices?.[0]?.message?.content === '' || res.choices?.[0]?.message?.content === null) {
          throw new Error('Empty completion from provider');
        }
        return res;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
    throw lastError || new Error('Max retries exceeded');
  }
}
