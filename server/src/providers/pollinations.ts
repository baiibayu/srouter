import { OpenAICompatProvider, isAnonymousCredential } from './openai-compat.js';
import type { KeyValidationResult, CompletionOptions } from './base.js';
import { recordQuotaObservationsFromResponse, type QuotaObservationContext } from '../services/provider-quota.js';
import type { ChatMessage, ChatCompletionResponse, ChatCompletionChunk } from '@baiibayu/srouter-shared/types.js';

const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai/v1';
const POLLINATIONS_TEXT_URL = 'https://text.pollinations.ai/openai';
/** Authenticated key-introspection endpoint — note it sits OUTSIDE /v1. */
const POLLINATIONS_ACCOUNT_KEY_URL = 'https://gen.pollinations.ai/account/key';

const TEXT_COMPAT_MODELS = new Set(['openai-fast', 'openai', 'gpt-oss', 'gpt-oss-20b', 'ovh-reasoning']);

/**
 * Pollinations — OpenAI-compatible shared-capacity tier.
 *
 * Anonymous/keyless requests route to https://text.pollinations.ai/openai
 * which serves the free tier (openai-fast / gpt-oss-20b) with zero authentication.
 *
 * Authenticated requests (with an API key from enter.pollinations.ai) route to
 * https://gen.pollinations.ai/v1 which unlocks all catalog models and higher limits.
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

  protected override resolveBaseUrl(apiKey?: string): string {
    return isAnonymousCredential(apiKey) ? POLLINATIONS_TEXT_URL : POLLINATIONS_BASE_URL;
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

  /** Resolve effective model ID: for keyless calls, route models not recognized
   * by the Classic text endpoint to openai-fast. */
  private resolveModelForMode(apiKey: string, modelId: string): string {
    const stripped = this.stripPlatformPrefix(modelId);
    if (isAnonymousCredential(apiKey)) {
      if (TEXT_COMPAT_MODELS.has(stripped.toLowerCase())) return stripped;
      return 'openai-fast';
    }
    return stripped;
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
    const effectiveModelId = this.resolveModelForMode(apiKey, modelId);
    return super.chatCompletion(apiKey, messages, effectiveModelId, options, quotaContext);
  }

  override async *streamChatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext,
  ): AsyncGenerator<ChatCompletionChunk> {
    const effectiveModelId = this.resolveModelForMode(apiKey, modelId);
    for await (const chunk of super.streamChatCompletion(apiKey, messages, effectiveModelId, options, quotaContext)) {
      yield chunk;
    }
  }

  override async validateKey(apiKey: string, quotaContext?: QuotaObservationContext): Promise<KeyValidationResult> {
    // Keyless path: confirm the upstream is reachable via the public models catalog.
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