import { OpenAICompatProvider, isAnonymousCredential } from './openai-compat.js';
import type { KeyValidationResult } from './base.js';
import { recordQuotaObservationsFromResponse, type QuotaObservationContext } from '../services/provider-quota.js';

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
      headers: { 'Authorization': `Bearer ${apiKey}` },
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
