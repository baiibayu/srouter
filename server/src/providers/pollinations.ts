import { OpenAICompatProvider, isAnonymousCredential } from './openai-compat.js';
import type { KeyValidationResult, CompletionOptions } from './base.js';
import { recordQuotaObservationsFromResponse, type QuotaObservationContext } from '../services/provider-quota.js';
import type { ChatMessage, ChatCompletionResponse, ChatCompletionChunk } from '@baiibayu/srouter-shared/types.js';

const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai/v1';
/** Authenticated key-introspection endpoint — note it sits OUTSIDE /v1. */
const POLLINATIONS_ACCOUNT_KEY_URL = 'https://gen.pollinations.ai/account/key';

/**
 * Pollinations — OpenAI-compatible shared-capacity tier.
 *
 * Free models are accessible without an API key (keyless). The public
 * GET /v1/models catalog lists all available models, including 135+ free
 * routes that accept requests with no Authorization header. Authenticated
 * keys unlock paid models and higher rate limits.
 *
 * validateKey probes the public /v1/models endpoint (which answers 200
 * without auth) to confirm network reachability. A live /v1/models response
 * means the platform is up and keyless routing will work.
 *
 * Keyed access validates against /account/key (401 for missing/invalid key,
 * 200 for live keys, 402 for out-of-pollen accounts). See issue #608.
 */
export class PollinationsProvider extends OpenAICompatProvider {
  override keyless = true;

  constructor() {
    super({
      platform: 'pollinations',
      name: 'Pollinations',
      baseUrl: POLLINATIONS_BASE_URL,
    });
  }

  /** Map the stored credential to the bearer we send upstream. The keyless flow
   * stores `'no-key'` (or nothing) for the anonymous case → send NO Authorization
   * header for keyless calls. Any other stored value is treated as a real key. */
  private resolveBearer(apiKey: string): string {
    const k = apiKey?.trim();
    if (!k || k === 'no-key') return '';
    return k;
  }

  /** Pollinations expects model IDs like "openai/gpt-5.4-nano" or "mistralai/mistral-large-3".
   * Strip only the SRouter platform prefix ("pollinations/") if present. */
  private stripPlatformPrefix(modelId: string): string {
    const platformPrefix = `${this.platform}/`;
    return modelId.startsWith(platformPrefix) ? modelId.slice(platformPrefix.length) : modelId;
  }

  /** Anonymous access sends NO Authorization header: keyless providers
   * (Pollinations) holding the stored `no-key` sentinel, and
   * custom endpoints whose stored credential is the same sentinel with auth
   * off. Sending `Bearer no-key` upstream is never right — upstreams read it
   * as an invalid key. A REAL key saved on a keyless platform is used instead
   * of the anonymous path, and a real key on a custom endpoint still gets its
   * bearer (#1331): the presence of a credential decides at request time. */
  protected authHeader(apiKey: string): Record<string, string> {
    const k = this.resolveBearer(apiKey);
    if (!k) return {};
    return { Authorization: `Bearer ${k}` };
  }

  override async chatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext,
  ): Promise<ChatCompletionResponse> {
    const strippedModelId = this.stripPlatformPrefix(modelId);
    return super.chatCompletion(apiKey, messages, strippedModelId, options, quotaContext);
  }

  override async *streamChatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext,
  ): AsyncGenerator<ChatCompletionChunk> {
    const strippedModelId = this.stripPlatformPrefix(modelId);
    for await (const chunk of super.streamChatCompletion(apiKey, messages, strippedModelId, options, quotaContext)) {
      yield chunk;
    }
  }

  override async validateKey(apiKey: string, quotaContext?: QuotaObservationContext): Promise<KeyValidationResult> {
    // Keyless path: confirm the upstream is reachable via the public models
    // catalog. A 200 from /v1/models means keyless routing will work.
    if (isAnonymousCredential(apiKey)) {
      const res = await this.fetchWithTimeout(`${POLLINATIONS_BASE_URL}/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }, 30000, { timeoutBounds: 'request' });
      recordQuotaObservationsFromResponse(res, {
        platform: this.platform,
        keyId: quotaContext?.keyId,
        providerAccountId: quotaContext?.providerAccountId,
        quotaPoolKey: quotaContext?.quotaPoolKey,
        endpoint: 'v1/models',
      });
      if (res.ok) return true;
      return { valid: false, error: `Pollinations /v1/models returned HTTP ${res.status}` };
    }

    // Keyed path: probe the authenticated /account/key endpoint (#608).
    const res = await this.fetchWithTimeout(POLLINATIONS_ACCOUNT_KEY_URL, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.resolveBearer(apiKey)}` },
    }, 30000, { timeoutBounds: 'request' });

    recordQuotaObservationsFromResponse(res, {
      platform: this.platform,
      keyId: quotaContext?.keyId,
      providerAccountId: quotaContext?.providerAccountId,
      quotaPoolKey: quotaContext?.quotaPoolKey,
      endpoint: 'account/key',
    });

    if (res.status === 401) return this.validationResult(res);
    if (res.ok || res.status === 402) return true;

    if (res.status === 403) {
      throw new Error(
        `Pollinations key validation inconclusive: HTTP 403 from /account/key. ` +
        `The key authenticated but lacks permission for the introspection endpoint, ` +
        `so it is NOT treated as revoked.`,
      );
    }
    throw new Error(`Pollinations /account/key returned HTTP ${res.status} — key validity unknown`);
  }
}