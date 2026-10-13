import { OpenAICompatProvider } from './openai-compat.js';

/**
 * xKiro (xkiro.com) — OpenAI-compatible aggregator at api.xkiro.com/v1.
 *
 * Free key from xkiro.com (no card); the free plan is a 5M tokens/day budget
 * shared across its free models. `GET /v1/models` is public (200 with no key),
 * so `validateUrl` points at `/v1/usage`, which 401s on a missing or invalid
 * ClientApiKey. Accepts `Authorization: Bearer` or `x-api-key`.
 *
 * ── Why this class exists ───────────────────────────────────────────────────
 * xKiro's own metadata cannot be taken at face value, in two independent ways.
 * Both were established by live probing (2026-09-26) and both matter because
 * the generic discovery path gets each one wrong.
 *
 * 1. **The `:free` id suffix under-reports the free roster.** `/v1/models`
 *    marks every row with an explicit `access_tier` (`'free' | 'paid' |
 *    'premium'`). 58 rows are `free`, but only 28 of those carry the suffix.
 *    A suffix-based filter therefore throws away 30 genuinely free models —
 *    every Cohere `command-*` row, both Sensenova rows, and most Mistral ones —
 *    while adding nothing, because no `:free` row is ever `paid`/`premium`.
 *    So the tier field is authoritative here and the suffix is ignored.
 *
 * 2. **`access_tier: 'free'` is not a promise of free ACCESS.** All five
 *    `deepseek/*` rows are labelled `access_tier: 'free'` with zero pricing,
 *    and every one of them answers a free-plan key with
 *    `403 "This model is available to paying customers only. Subscribe to a
 *    plan or top up your wallet to use it."` — deterministically, on every key
 *    (verified across 5 distinct requests). `min_plan_usd`/`min_plan_names`,
 *    the fields that might have declared this, are `undefined` on exactly those
 *    rows. No metadata field separates them, so the only trustworthy signal is
 *    a live probe; see `probeFreeAccess`.
 *
 * Catalog rows otherwise live in the hosted catalog, but that snapshot is
 * ~30 days old on a free install and listed only the 8 Mistral rows, so the
 * roster is refreshed by discovery instead (services/auto-discover.ts).
 */
export class XKiroProvider extends OpenAICompatProvider {
  /** Marks the platform whose `/v1/models` carries an authoritative per-row
   *  `access_tier`. Read by the discovery filter in services/auto-discover.ts. */
  readonly hasAccessTier = true;

  constructor() {
    super({
      platform: 'xkiro',
      name: 'xKiro',
      baseUrl: 'https://api.xkiro.com/v1',
      validateUrl: 'https://api.xkiro.com/v1/usage',
    });
  }
}

/** Outcome of probing one model with a free-plan key. */
export type FreeAccessVerdict =
  /** Answered — usable on the free plan. */
  | 'ok'
  /** Refused because the model needs a PAID plan. Safe to exclude. */
  | 'paid'
  /** Retired/gone upstream. Safe to exclude. */
  | 'gone'
  /** Could not tell (quota, outage, timeout). Keep — absence of evidence. */
  | 'unknown'
  /** The KEY is rejected. Says nothing about the model; stop probing. */
  | 'unauthorized';

/** Wordings xKiro uses when a model is behind its paid plan. Kept tight: a
 *  generic 403 (account suspension, WAF) must not read as "this model costs
 *  money", because that would permanently exclude a model that is merely
 *  blocked for an unrelated, transient reason. */
const PAID_GATE_PATTERN = /paying customer|paid (?:account|plan|tier)|premium model|subscribe (?:to a plan|now|to unlock)|requires a (?:paid|premium)|top up your wallet|unlock premium|not available on (?:the )?free plan|free plan does not (?:include|support|have access)/;

/** Wordings meaning the id is gone, so it should not be registered either. */
const GONE_PATTERN = /does not exist|not found|no such model|no model found|unknown model|end of life|no longer available|has been (?:retired|removed|discontinued|deprecated)/;

/**
 * Ask xKiro whether one model is actually reachable on a free plan.
 *
 * A 1-token completion is the cheapest request that proves access: the free
 * plan's budget is measured in tokens, so a single token costs nothing
 * meaningful, and the verdict is about the plan rather than the output. The
 * prompt is deliberately tiny so it cannot be mistaken for real traffic.
 *
 * Never throws — a transport failure is `'unknown'`, which keeps the model.
 * Only positive evidence of a gate excludes anything.
 */
export async function probeFreeAccess(
  apiKey: string,
  modelId: string,
  options: { baseUrl?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<FreeAccessVerdict> {
  const baseUrl = (options.baseUrl ?? 'https://api.xkiro.com/v1').replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? 15_000;

  const timer = new AbortController();
  const onAbort = () => timer.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => timer.abort(), timeoutMs);

  let res: Response;
  let bodyText = '';
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      signal: timer.signal,
    });
    // The error payload carries the verdict, so read it even for a non-OK
    // status. Bounded: an HTML error page must not be parsed as prose.
    bodyText = (await res.text()).slice(0, 2000);
  } catch {
    // Timeout, DNS, connection reset — nothing was learned about the model.
    return 'unknown';
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }

  if (res.ok) return 'ok';
  if (res.status === 401) return 'unauthorized';

  const text = bodyText.toLowerCase();
  if (res.status === 403 || res.status === 402) {
    if (PAID_GATE_PATTERN.test(text)) return 'paid';
    // A 403/402 we cannot attribute to the plan says nothing reliable about
    // this model in particular (suspended account, edge block, billing hold).
    // Log so operators can spot new gate wording and extend PAID_GATE_PATTERN.
    console.warn(
      `[xkiro] unrecognized ${res.status} for ${modelId} — not matching PAID_GATE_PATTERN. ` +
      `Response snippet: "${bodyText.slice(0, 200).replace(/\n/g, ' ')}"`,
    );
    return 'unknown';
  }
  if (res.status === 404 || res.status === 410) return 'gone';
  if (GONE_PATTERN.test(text)) return 'gone';

  // 429 (free-pool quota spent), 5xx (upstream down), anything else: the model
  // exists and the key is fine — we simply did not get to run it.
  return 'unknown';
}
