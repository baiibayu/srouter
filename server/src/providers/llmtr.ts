import type { ChatCompletionChunk, ChatCompletionResponse, ChatMessage } from '@baiibayu/srouter-shared/types.js';
import { providerHttpError, type CompletionOptions, type KeyValidationResult } from './base.js';
import { OpenAICompatProvider } from './openai-compat.js';
import { providerTimeoutMs } from '../lib/provider-timeout.js';
import { recordQuotaObservationsFromResponse, type QuotaObservationContext } from '../services/provider-quota.js';

export const LLMTR_BASE_URL = 'https://llmtr.com/v1';
const VALIDATION_MODEL = '__srouter_key_validation__';

function checkModel(requested: string, returned: string): void {
  if (returned !== requested) {
    throw Object.assign(new Error('LLMTR returned a different or missing model identity'), { status: 502 });
  }
}

/** True when a 403 body says LLMTR refuses automated key-validation probes
 * (#1390) rather than rejecting the key. Reads a clone so the caller's
 * validationResult can still consume the body. */
async function blocksAutomatedValidation(res: Response): Promise<boolean> {
  const body = await res.clone().json().catch(() => null) as { error?: { message?: string }; message?: string } | null;
  const text = [body?.error?.message, body?.message].filter((v): v is string => typeof v === 'string').join(' ').toLowerCase();
  return text.includes('automated api key validation') || (text.includes('automated') && text.includes('validation'));
}

/** Selected zero-priced routes have renewable daily/rolling quotas, not a
 * monthly cash grant. Only the signed catalog supplies model rows: the public
 * roster also contains paid models, expiring promotions and BYOK-only rows. */
export class LlmtrProvider extends OpenAICompatProvider {
  constructor() {
    super({ platform: 'llmtr', name: 'LLMTR', baseUrl: LLMTR_BASE_URL });
  }

  override async validateKey(apiKey: string, quotaContext?: QuotaObservationContext): Promise<KeyValidationResult> {
    // /models is public; /api/usage expects a dashboard token. This nonexistent
    // model checks authentication without generating tokens: live controls on
    // 2026-09-29 returned 401/auth_error for an invalid key and
    // 404/model_not_found for the valid key. Do not accept generic 404s.
    const res = await this.fetchWithTimeout(`${LLMTR_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: VALIDATION_MODEL, messages: [{ role: 'user', content: 'key validation' }], max_tokens: 1, stream: false }),
    }, providerTimeoutMs(this.platform, 30_000), { timeoutBounds: 'request' });
    recordQuotaObservationsFromResponse(res, { ...quotaContext, platform: this.platform, endpoint: 'key-validation' });
    if ([401, 403].includes(res.status)) {
      // #1390: LLMTR answers the probe itself with 403 "Automated API key
      // validation tools are not supported." That is a verdict about the
      // request shape, not the key. Returning valid:false here would let the
      // health service's three-strike counter auto-disable a perfectly good
      // key purely because it was probed. Same shape as the Cloudflare
      // challenge guard in base.validationResult (#1298): inconclusive, never
      // a disable.
      if (res.status === 403 && await blocksAutomatedValidation(res)) {
        throw providerHttpError(res, 'LLMTR rejected the key-validation probe itself (automated validation not supported); the key was not checked');
      }
      return this.validationResult(res);
    }
    if (res.status === 404) {
      const body = await res.clone().json().catch(() => null) as { error?: { type?: string } } | null;
      if (body?.error?.type === 'model_not_found') return true;
    }
    throw providerHttpError(res, 'LLMTR key validation is temporarily inconclusive');
  }

  override async chatCompletion(apiKey: string, messages: ChatMessage[], modelId: string,
    options?: CompletionOptions, quotaContext?: QuotaObservationContext): Promise<ChatCompletionResponse> {
    const response = await super.chatCompletion(apiKey, messages, modelId, options, quotaContext);
    checkModel(modelId, response.model);
    return response;
  }

  override async *streamChatCompletion(apiKey: string, messages: ChatMessage[], modelId: string,
    options?: CompletionOptions, quotaContext?: QuotaObservationContext): AsyncGenerator<ChatCompletionChunk> {
    for await (const chunk of super.streamChatCompletion(apiKey, messages, modelId, options, quotaContext)) {
      checkModel(modelId, chunk.model);
      yield chunk;
    }
  }
}
