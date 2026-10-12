/**
 * auto-discover — Automatically discover and register ALL model types
 * (chat, embeddings, media) when a provider key is added but the catalog
 * hasn't shipped models for it yet.
 *
 * This bypasses the catalog gate: instead of telling users to "add as custom
 * endpoint", we query the provider's own /v1/models endpoint with the user's
 * key and register discovered models directly.
 *
 * All modalities are discovered:
 *   - Chat models → models table
 *   - Embedding models → embedding_models table (dimensions auto-guessed)
 *   - Image/audio/video/transcription → media_models table
 *   - Provider quirks auto-assigned from known patterns
 *
 * Models are inserted with source='user' so catalog syncs never delete them.
 */

import type { Db } from '../db/types.js';
import { getDb } from '../db/index.js';
import { resolveProvider } from '../providers/index.js';
import { OpenAICompatProvider } from '../providers/openai-compat.js';
import { parseModelCatalog, type DiscoveredModelKind } from './model-discovery.js';
import { ensureModelInProfiles } from './profile-models.js';
import { addNotifications, getSyncIntervalHours, type SyncNotification } from './catalog-sync.js';
import type { Scheduler } from '../lib/scheduler.js';
import type { Platform } from '@srouter/shared/types.js';

// Large provider list — skip auto-discover for these well-known providers
// that either don't have /v1/models, are handled by the catalog already,
// or are 100% paid and we don't want to register any of their models.
const SKIP_AUTO_DISCOVER = new Set([
  'ollama',       // local, handled separately
  'custom',       // custom endpoints use their own flow
  'aihorde',      // uses its own API format
  'bai',          // 100% paid — "Deposit required to unlock premium models"
]);

/** How many models to register per platform before giving up */
const MAX_AUTO_MODELS = 300;

// How many model names one bell row may name before it elides the rest.
// A provider can gain dozens of models in one refresh; naming all of them
// turns the bell into a wall of text.
const DISCOVER_NOTIFICATION_MODELS = 5;

// ── Platform-specific rate-limit defaults (P0) ───────────────────
// Documented or observed free-tier limits per platform.  These replace
// the old hardcoded 60/1000/100000/1000000 that was applied to every
// platform regardless of its actual cap.
//
// null = no known limit (routing falls back to provider-quota observations)
// Values are per-model unless noted as per-account in comments.
interface PlatformRateDefaults {
  rpm: number | null;   // requests per minute
  rpd: number | null;   // requests per day
  tpm: number | null;   // tokens per minute
  tpd: number | null;   // tokens per day
}
const PLATFORM_DEFAULTS: Record<string, PlatformRateDefaults> = {
  // ── Aggregators with published/observed limits ──
  openrouter:  { rpm: 5,    rpd: 50,    tpm: null,     tpd: null },     // free tier: 50 req/day (1000 with $10 credits); ~5 rpm observed
  routeway:    { rpm: 5,    rpd: 200,   tpm: null,     tpd: null },     // same pool as OpenRouter backend: 200 rpd
  kilo:        { rpm: 3,    rpd: 200,   tpm: null,     tpd: null },     // 200 req/hr keyless per IP
  llm7:        { rpm: 2,    rpd: 100,   tpm: null,     tpd: null },     // 100 req/hr
  unorouter:   { rpm: 1,    rpd: 60,    tpm: null,     tpd: null },     // 1 req/min per account per model
  bazaarlink:  { rpm: 1,    rpd: 60,    tpm: null,     tpd: null },     // auto:free route
  orcarouter:  { rpm: 1,    rpd: 60,    tpm: null,     tpd: null },     // limits unpublished, tight free tier
  nara:        { rpm: 3,    rpd: 100,   tpm: null,     tpd: null },     // free plan, conservative
  'opencode-free': { rpm: 5, rpd: 200,  tpm: null,     tpd: null },     // zen free tier, unpublished limits
  'opencode-go':   { rpm: 10, rpd: 500, tpm: null,     tpd: null },     // go tier, separate pool from zen

  // ── First-party providers (documented free tier) ──
  groq:        { rpm: 30,   rpd: 14400, tpm: 131072,  tpd: 5000000 },  // free tier; varies by model
  navy:        { rpm: 20,   rpd: null,  tpm: null,     tpd: 150000 },  // 150K tokens/day, 20 RPM
  airforce:    { rpm: 1,    rpd: 60,    tpm: null,     tpd: null },     // 1 req/min per account
  ovh:         { rpm: 2,    rpd: null,  tpm: null,     tpd: null },     // 2 req/min keyless per model
  modelscope:  { rpm: 1,    rpd: 2000,  tpm: null,     tpd: null },     // 2000 req/day
  sealion:     { rpm: 10,   rpd: null,  tpm: null,     tpd: null },     // 10 RPM free tier
  radeon:      { rpm: 30,   rpd: null,  tpm: null,     tpd: null },     // 30 RPM; $10/day credits
  agnes:       { rpm: 30,   rpd: null,  tpm: null,     tpd: null },     // ~30 concurrent before 429

  // ── Providers with generous/unpublished limits (conservative) ──
  mistral:     { rpm: 30,   rpd: null,  tpm: null,     tpd: null },     // free plan, ~30 rpm observed
  nvidia:      { rpm: 40,   rpd: null,  tpm: null,     tpd: null },     // generous free tier
  google:      { rpm: 15,   rpd: null,  tpm: 1000000, tpd: 50000000 }, // generous but bounded
  anyapi:      { rpm: null, rpd: null,  tpm: null,     tpd: 100000 },   // 100K tokens/day documented
  zhipu:       { rpm: null, rpd: null,  tpm: null,     tpd: null },
  siliconflow: { rpm: null, rpd: null,  tpm: null,     tpd: null },
  ollama:      { rpm: null, rpd: null,  tpm: null,     tpd: null },
};

/** Conservative fallback when a platform is not in the map. */
const DEFAULT_FALLBACK: PlatformRateDefaults = { rpm: 30, rpd: 1000, tpm: 100000, tpd: 1000000 };

/** Resolve the rate-limit defaults for a platform. */
function platformRates(platform: string): PlatformRateDefaults {
  return PLATFORM_DEFAULTS[platform] ?? DEFAULT_FALLBACK;
}

// ── Model rank inference from name heuristics (P2) ───────────────
// Instead of a flat `100 + idx`, we score models by name signals so the
// router prefers fast models for latency-sensitive routes and big models
// for quality-sensitive ones.  Lower number = better.
interface ModelRanks { intelligence: number; speed: number }
function inferModelRanks(modelId: string): ModelRanks {
  const lower = modelId.toLowerCase();
  let intel = 100;
  let spd   = 100;

  // Speed boosts (lower = faster / lighter)
  if (/(?:^|-)(?:flash|mini|fast|lite|tiny|nano)(?:$|-)/i.test(lower)) spd = 80;
  if (/(?:^|-)(?:turbo|instant|quick)(?:$|-)/i.test(lower))           spd = 85;
  if (/(?:^|-)(?:haiku|small)(?:$|-)/i.test(lower))                   spd = 85;
  if (/(?:^|-)(?:medium)(?:$|-)/i.test(lower))                        spd = 95;

  // Speed penalties (slower / heavier)
  if (/70b|405b|120b/i.test(lower))                                    spd = 120;
  if (/(?:^|-)(?:large|ultra|thinking|reasoning)(?:$|-)/i.test(lower)) spd = 115;
  if (/(?:^|-)(?:pro(?!mo)|max)(?:$|-)/i.test(lower))                 spd = 110;

  // Intelligence boosts (lower = smarter)
  if (/405b/i.test(lower))        intel = 80;
  if (/70b|120b/i.test(lower))    intel = 85;
  if (/(?:^|-)(?:opus)(?:$|-)/i.test(lower))    intel = 82;
  if (/(?:^|-)(?:sonnet)(?:$|-)/i.test(lower))  intel = 88;
  if (/(?:^|-)(?:pro(?!mo)|max|ultra)(?:$|-)/i.test(lower)) intel = 85;
  if (/(?:^|-)(?:plus)(?:$|-)/i.test(lower))    intel = 90;

  // Intelligence penalties (weaker / distilled)
  if (/(?:^|-)(?:flash|mini|tiny|nano|lite)(?:$|-)/i.test(lower)) intel = 120;
  if (/(?:^|-)(?:small)(?:$|-)/i.test(lower))                     intel = 115;

  return { intelligence: intel, speed: spd };
}

// ── Embedding dimension guessing ──────────────────────────────────
// When the provider doesn't report dimensions, we estimate from the model id.
function guessEmbeddingDimensions(modelId: string): number {
  const lower = modelId.toLowerCase();
  if (/3072/.test(lower)) return 3072;
  if (/1536/.test(lower)) return 1536;
  if (/1024/.test(lower)) return 1024;
  if (/768/.test(lower)) return 768;
  if (/512/.test(lower)) return 512;
  if (/384/.test(lower)) return 384;
  if (/256/.test(lower)) return 256;
  if (/128/.test(lower)) return 128;
  // Well-known model families
  if (/text-embedding-3-small/.test(lower)) return 1536;
  if (/text-embedding-3-large/.test(lower)) return 3072;
  if (/text-embedding-ada/.test(lower)) return 1536;
  if (/nomic/.test(lower)) return 768;
  if (/bge-large/.test(lower)) return 1024;
  if (/bge-base/.test(lower)) return 768;
  if (/bge-small/.test(lower)) return 512;
  if (/e5-large/.test(lower)) return 1024;
  if (/e5-base/.test(lower)) return 768;
  if (/e5-small/.test(lower)) return 512;
  if (/cohere/.test(lower)) return 1024;
  return 0; // unknown
}

/** Extract dimensions from the raw API response, or fall back to heuristics. */
function extractDimensions(modelId: string, rawModels: any[]): number {
  const raw = rawModels.find((m: any) => {
    const id = m?.id ?? m?.name ?? m?.model ?? m?.model_id ?? m?.modelId ?? m?.slug;
    return id === modelId;
  });
  if (raw) {
    const dim = raw.dimensions ?? raw.dim ?? raw.embedding_dim ?? raw.dimension;
    if (typeof dim === 'number' && dim > 0) return dim;
  }
  return guessEmbeddingDimensions(modelId);
}

/** Derive embedding family name from model id using well-known patterns. */
function guessEmbeddingFamily(modelId: string): string {
  const lower = modelId.toLowerCase();

  // Well-known embedding families — check specific patterns first
  if (/^bge[-_]/.test(lower))             return 'bge';
  if (/^e5[-_]/.test(lower))              return 'e5';
  if (/^jina[-_]/.test(lower))            return 'jina';
  if (/^gte[-_]/.test(lower))             return 'gte';
  if (/^gte[-_]?embed/.test(lower))       return 'gte';
  if (/^nomic[-_]/.test(lower))           return 'nomic';
  if (/^cohere[-_]|^embed[-_]/.test(lower)) return 'cohere';
  if (/^openai[-_]|^text-embedding[-_]/.test(lower)) return 'openai';
  if (/^sentence[-_]transformer/.test(lower)) return 'sentence-transformer';
  if (/^instructor[-_]/.test(lower))      return 'instructor';
  if (/^sfr[-_]/.test(lower))             return 'sfr';
  if (/^snowflake[-_]/.test(lower))       return 'snowflake';
  if (/^mxbai[-_]/.test(lower))           return 'mxbai';
  if (/^voyage[-_]/.test(lower))          return 'voyage';
  if (/^arctic[-_]/.test(lower))          return 'arctic';
  if (/^multilingual[-_]/.test(lower))    return 'multilingual-e5';

  // Fallback: strip version suffixes
  return lower.replace(/[-_]v?\d+$/, '').replace(/[-_]0\d+$/, '') || modelId;
}

// ── Quirk auto-detection ──────────────────────────────────────────
/** Known provider patterns we auto-detect from the /v1/models response. */
const AUTO_QUIRK_DETECTORS: Array<{
  detect: (platform: string, models: { id: string; kind?: DiscoveredModelKind; contextWindow?: number; isFree?: boolean; priceNote?: string }[]) => boolean;
  slug: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'blocker';
}> = [
  {
    detect: (_p, models) => models.length > 3 && models.every(m => !m.priceNote && !m.isFree),
    slug: 'auto-no-pricing',
    title: 'No pricing info from upstream',
    body: 'This provider did not advertise pricing in /v1/models. Models may be free or paid — verify before relying on them.',
    severity: 'info',
  },
  {
    detect: (_p, models) => {
      const chat = models.filter(m => !m.kind);
      if (chat.length < 3) return false;
      return chat.filter(m => (m.contextWindow ?? 128000) < 8192).length > chat.length * 0.5;
    },
    slug: 'auto-short-context',
    title: 'Most chat models have short context',
    body: 'More than half of discovered chat models have context windows under 8K tokens. Consider a different provider for long-context tasks.',
    severity: 'warning',
  },
  {
    detect: (_p, models) => {
      const hasChat = models.some(m => !m.kind);
      const hasEmbed = models.some(m => m.kind === 'embedding');
      return !hasChat && hasEmbed && models.length > 0;
    },
    slug: 'auto-embeddings-only',
    title: 'Embeddings-only provider',
    body: 'This provider only serves embedding models. It cannot be used for chat completions.',
    severity: 'info',
  },
  {
    detect: (_p, models) => models.length > 0 && models.every(m => m.isFree === true),
    slug: 'auto-all-free',
    title: 'All models reported as free',
    body: 'Every model from this provider is advertised as free. Free tiers can change without notice.',
    severity: 'info',
  },
  // ── P4: expanded quirk detectors ─────────────────────────────
  // NOTE: auto-empty-response-prone is now evidence-based (see queryEmptyResponseRatio + autoAssignQuirks).
  // It is NOT a static detector — it queries the requests table for actual empty-completion rates.
  {
    // Many models lack context window info
    detect: (_p, models) => {
      if (models.length < 5) return false;
      return models.filter(m => !m.contextWindow || m.contextWindow === 0).length > models.length * 0.7;
    },
    slug: 'auto-missing-context-info',
    title: 'Most models lack context window info',
    body: 'More than 70% of models from this provider have no context window data. Default 128K is used; actual limits may differ.',
    severity: 'info',
  },
  {
    // Large model catalog — likely an aggregator
    detect: (_p, models) => models.length > 50,
    slug: 'auto-many-models',
    title: 'Large model catalog (50+)',
    body: 'This provider offers 50+ models, suggesting it is an aggregator. Some models may be behind paid gates despite appearing free.',
    severity: 'info',
  },
  {
    // All models have small context windows (<=32K)
    detect: (_p, models) => {
      const chat = models.filter(m => !m.kind);
      if (chat.length < 3) return false;
      return chat.every(m => (m.contextWindow ?? 128000) <= 32768);
    },
    slug: 'auto-small-context-only',
    title: 'All chat models have small context (<=32K)',
    body: 'All chat models from this provider have context windows of 32K or less. Not suitable for long-context tasks.',
    severity: 'warning',
  },
  {
    // Only media models (no chat, no embeddings)
    detect: (_p, models) => {
      const hasChat = models.some(m => !m.kind);
      const hasEmb = models.some(m => m.kind === 'embedding');
      const hasMedia = models.some(m => m.kind && m.kind !== 'embedding');
      return !hasChat && !hasEmb && hasMedia && models.length > 0;
    },
    slug: 'auto-media-only',
    title: 'Media-only provider',
    body: 'This provider only serves generative media models (image/audio/video). It cannot be used for chat or embeddings.',
    severity: 'info',
  },
  {
    // Only 1-2 models — limited provider
    detect: (_p, models) => {
      const chat = models.filter(m => !m.kind);
      return chat.length >= 1 && chat.length <= 2;
    },
    slug: 'auto-few-models',
    title: 'Very few chat models (1-2)',
    body: 'This provider only offers 1-2 chat models. Consider using it only as a fallback, not a primary route.',
    severity: 'info',
  },
];

// ── Evidence-based empty response detection ─────────────────────
// Instead of hardcoding known-bad platforms, we query the requests table
// for actual empty-completion rates. A platform gets flagged when:
//   - ≥50 requests in the last 7 days (enough data to judge)
//   - >15% of those requests resulted in empty completions
// The quirk is automatically removed when the ratio drops below 10%
// (platform improved) or when there isn't enough data yet.

const EMPTY_RESPONSE_RATIO_ADD    = 0.15;  // 15% → add quirk
const EMPTY_RESPONSE_RATIO_REMOVE = 0.10;  // 10% → remove quirk (improved)
const EMPTY_RESPONSE_MIN_REQUESTS = 50;    // need at least this many to judge
const EMPTY_RESPONSE_WINDOW_DAYS  = 7;

/**
 * Query the requests table for empty-completion evidence on a platform.
 * Returns { ratio, total, empty } or null if insufficient data.
 */
function queryEmptyResponseRatio(
  db: Db,
  platform: string,
): { ratio: number; total: number; empty: number } | null {
  const since = new Date(Date.now() - EMPTY_RESPONSE_WINDOW_DAYS * 86_400_000).toISOString();
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN error LIKE '%empty completion%' THEN 1 ELSE 0 END) AS empty
    FROM requests
    WHERE platform = ? AND created_at >= ?
  `).get(platform, since) as { total: number; empty: number } | undefined;

  if (!row || row.total < EMPTY_RESPONSE_MIN_REQUESTS) return null;
  return { ratio: row.empty / row.total, total: row.total, empty: row.empty };
}

/**
 * Auto-assign quirks to a platform based on what we observe in its /v1/models.
 * Only inserts quirks that don't already exist (operator or catalog quirks win).
 */
function autoAssignQuirks(
  db: Db,
  platform: string,
  models: { id: string; kind?: DiscoveredModelKind; contextWindow?: number; isFree?: boolean; priceNote?: string }[],
  _rawModels: any[],
): number {
  const insertQuirk = db.prepare(`
    INSERT OR IGNORE INTO quirks (slug, title, body, severity, created_at_ms, updated_at_ms)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const getQuirkId = db.prepare('SELECT id FROM quirks WHERE slug = ?');
  const insertTarget = db.prepare(
    'INSERT OR IGNORE INTO quirk_targets (quirk_id, platform, model_glob) VALUES (?, ?, ?)'
  );

  const now = Date.now();
  let count = 0;

  for (const detector of AUTO_QUIRK_DETECTORS) {
    if (!detector.detect(platform, models)) continue;
    // Scoped slug: platform prefix prevents cross-platform collision
    const scopedSlug = `${detector.slug}--${platform}`;
    // Skip if already exists (operator or catalog already set it)
    const existing = db.prepare('SELECT 1 FROM quirks WHERE slug = ?').get(scopedSlug);
    if (existing) continue;

    insertQuirk.run(scopedSlug, detector.title, detector.body, detector.severity, now, now);
    const quirkRow = getQuirkId.get(scopedSlug) as { id: number } | undefined;
    if (quirkRow) {
      insertTarget.run(quirkRow.id, platform, null);
      count++;
    }
  }

  // ── Evidence-based empty response detection ────────────────────
  // Instead of hardcoding platform names, we query actual request logs.
  // The quirk is added when empty-completion ratio >15% (min 50 requests
  // in 7 days), and auto-removed when the ratio drops below 10%.
  const emptySlug = `auto-empty-response-prone--${platform}`;
  const emptyEvidence = queryEmptyResponseRatio(db, platform);

  if (emptyEvidence) {
    const { ratio, total, empty } = emptyEvidence;
    if (ratio > EMPTY_RESPONSE_RATIO_ADD) {
      // Ratio is high → add quirk if not already present, or update evidence
      const existing = db.prepare('SELECT id FROM quirks WHERE slug = ?').get(emptySlug) as { id: number } | undefined;
      if (!existing) {
        insertQuirk.run(
          emptySlug,
          'Provider has high empty-completion rate (evidence-based)',
          `${Math.round(ratio * 100)}% of ${total} requests in the last ${EMPTY_RESPONSE_WINDOW_DAYS} days returned empty completions (${empty} empty). A retry/backoff strategy is recommended.`,
          'warning',
          now, now,
        );
        const quirkRow = getQuirkId.get(emptySlug) as { id: number } | undefined;
        if (quirkRow) {
          insertTarget.run(quirkRow.id, platform, null);
          count++;
        }
      } else {
        // Update the evidence body so stale hardcoded descriptions get refreshed
        const newBody = `${Math.round(ratio * 100)}% of ${total} requests in the last ${EMPTY_RESPONSE_WINDOW_DAYS} days returned empty completions (${empty} empty). A retry/backoff strategy is recommended.`;
        db.prepare('UPDATE quirks SET body = ?, updated_at_ms = ? WHERE id = ?').run(newBody, now, existing.id);
      }
    } else if (ratio < EMPTY_RESPONSE_RATIO_REMOVE) {
      // Ratio is low → remove the auto-detected quirk (platform improved)
      const existing = db.prepare('SELECT id FROM quirks WHERE slug = ?').get(emptySlug) as { id: number } | undefined;
      if (existing) {
        // Only remove if it was auto-detected (not operator/catalog-set)
        // Auto-detected quirks are identified by the 'auto-' prefix
        db.prepare('DELETE FROM quirk_targets WHERE quirk_id = ?').run(existing.id);
        db.prepare('DELETE FROM quirks WHERE id = ?').run(existing.id);
        count--; // signal that we removed a quirk (negative count convention)
      }
    }
    // If ratio is between REMOVE and ADD thresholds (10-15%), keep current state
  }

  return count;
}

// ── Monthly token budget estimation (P4) ────────────────────────
// Auto-discovered models have no monthly_token_budget label. We derive a
// human-readable estimate from the platform's rate limits so analytics
// ("Est. savings") and the headroom guardrail work right out of the box.
function estimateMonthlyBudget(
  tpd: number | null, tpm: number | null, rpd: number | null,
  rpm: number | null = null,
): string {
  // tpd (tokens per day) is the strongest signal
  if (tpd != null && tpd > 0) {
    const monthly = tpd * 30;
    if (monthly >= 1_000_000_000) return `~${Math.round(monthly / 1_000_000_000)}B`;
    if (monthly >= 1_000_000)     return `~${Math.round(monthly / 1_000_000)}M`;
    if (monthly >= 1_000)         return `~${Math.round(monthly / 1_000)}K`;
    return `~${monthly}`;
  }
  // tpm (tokens per minute) → extrapolate to 30-day month
  if (tpm != null && tpm > 0) {
    const monthly = tpm * 60 * 24 * 30;
    if (monthly >= 1_000_000_000) return `~${Math.round(monthly / 1_000_000_000)}B`;
    if (monthly >= 1_000_000)     return `~${Math.round(monthly / 1_000_000)}M`;
    if (monthly >= 1_000)         return `~${Math.round(monthly / 1_000)}K`;
    return `~${monthly}`;
  }
  // rpd (requests per day) → estimate ~1K tokens per request on average
  if (rpd != null && rpd > 0) {
    const monthly = rpd * 30 * 1000;
    if (monthly >= 1_000_000) return `~${Math.round(monthly / 1_000_000)}M`;
    if (monthly >= 1_000)     return `~${Math.round(monthly / 1_000)}K`;
    return `~${monthly}`;
  }
  // rpm (requests per minute) → extrapolate to 30-day month, ~1K tokens/request
  if (rpm != null && rpm > 0) {
    const monthly = rpm * 60 * 24 * 30 * 1000;
    if (monthly >= 1_000_000_000) return `~${Math.round(monthly / 1_000_000_000)}B`;
    if (monthly >= 1_000_000)     return `~${Math.round(monthly / 1_000_000)}M`;
    if (monthly >= 1_000)         return `~${Math.round(monthly / 1_000)}K`;
    return `~${monthly}`;
  }
  return '';
}

/**
 * Count enabled models for a platform across all model tables.
 */
export function enabledModelCountForPlatform(platform: string): number {
  const db = getDb();
  const row = db.prepare(`
    SELECT (SELECT COUNT(*) FROM models           WHERE platform = ? AND enabled = 1)
         + (SELECT COUNT(*) FROM embedding_models WHERE platform = ? AND enabled = 1)
         + (SELECT COUNT(*) FROM media_models     WHERE platform = ? AND enabled = 1) AS c
  `).get(platform, platform, platform) as { c: number };
  return row.c;
}

/** Detailed result returned by autoDiscoverModels. */
export interface DiscoverResult {
  registered: number;
  refreshed: number;
  retired: number;
  /** Embedding models discovered */
  embeddingsRegistered: number;
  embeddingsRefreshed: number;
  /** Media models discovered (image/audio/video/transcription) */
  mediaRegistered: number;
  mediaRefreshed: number;
  /** Provider quirks auto-assigned */
  quirksAssigned: number;
  newModels: string[];
  updatedModels: string[];
  retiredModels: string[];
}

/**
 * Discover and register models for a platform that has API keys but zero
 * models. Uses the provider's /v1/models endpoint with the user's own key.
 *
 * Returns a DiscoverResult with counts and model-name lists, or an empty
 * result if nothing was needed or discoverable.
 */
export async function autoDiscoverModels(platform: string, opts: { refresh?: boolean } = {}): Promise<DiscoverResult> {
  const empty: DiscoverResult = { registered: 0, refreshed: 0, retired: 0, embeddingsRegistered: 0, embeddingsRefreshed: 0, mediaRegistered: 0, mediaRefreshed: 0, quirksAssigned: 0, newModels: [], updatedModels: [], retiredModels: [] };
  if (SKIP_AUTO_DISCOVER.has(platform)) return empty;

  // Check if the platform already has all three model types — only skip if
  // chat + embeddings + media are all populated. Platforms that have chat
  // models but lack embeddings or media should still be discovered.
  if (!opts.refresh) {
    const dbPre = getDb();
    const row = dbPre.prepare(`
      SELECT
        (SELECT COUNT(*) FROM models WHERE platform = ? AND enabled = 1) AS chat,
        (SELECT COUNT(*) FROM embedding_models WHERE platform = ? AND enabled = 1) AS emb,
        (SELECT COUNT(*) FROM media_models WHERE platform = ? AND enabled = 1) AS media
    `).get(platform, platform, platform) as { chat: number; emb: number; media: number };
    if (row.chat > 0 && row.emb > 0 && row.media > 0) return empty;
  }

  const db = getDb();

  // Find an enabled key for this platform
  const keyRow = db.prepare(
    'SELECT id, encrypted_key, iv, auth_tag FROM api_keys WHERE platform = ? AND enabled = 1 LIMIT 1'
  ).get(platform) as { id: number; encrypted_key: string; iv: string; auth_tag: string } | undefined;

  if (!keyRow) return empty;

  // Resolve the provider
  const provider = resolveProvider(platform as Platform);
  if (!provider || !(provider instanceof OpenAICompatProvider)) return empty;

  // Decrypt the key (import dynamically to avoid circular deps)
  const { decrypt } = await import('../lib/crypto.js');
  let apiKey: string;
  try {
    apiKey = decrypt(keyRow.encrypted_key, keyRow.iv, keyRow.auth_tag);
  } catch {
    return empty;
  }

  // Fetch the provider's model catalog
  let models;
  let rawBody: unknown;
  try {
    const res = await provider.fetchModelCatalog(apiKey);
    if (!res.ok) {
      console.log(`[auto-discover] ${platform}/models returned HTTP ${res.status} — skipping`);
      return empty;
    }
    rawBody = await res.json();
    models = parseModelCatalog(rawBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[auto-discover] ${platform} discovery failed: ${msg}`);
    return empty;
  }

  if (models.length === 0) {
    console.log(`[auto-discover] ${platform} returned 0 models — skipping`);
    return empty;
  }

  // ── Free-tier filter ──────────────────────────────────────────────
  // We only want free models — loading paid ones causes 402/403 errors at
  // request time and clutters the routing chain with unusable entries.
  //
  // Strategy (ordered by priority):
  //   0. Providers that publish an explicit per-row `access_tier` (xkiro):
  //      keep access_tier === 'free'. This is the AUTHORITATIVE signal where it
  //      exists — xkiro's `:free` id suffix (rule 2) lists only 28 of its 58
  //      free rows, so the suffix filter silently dropped 30 free models, while
  //      no `:free` row is ever paid/premium. See providers/xkiro.ts.
  //   1. Providers with a `tier` field (e.g. airforce): only keep tier='free'
  //   2. Providers that use `:free` suffix convention (e.g. unorouter):
  //      only keep models whose id ends with ':free'
  //   3. Everything else: pass through (assumed free)
  let freeModels = models;
  const body = rawBody as Record<string, any>;
  const rawModels: any[] = Array.isArray(body?.data) ? body.data
    : Array.isArray(body?.models) ? body.models
    : Array.isArray(rawBody) ? rawBody as any[]
    : [];
  const hasAccessTierField = rawModels.some((m: any) => typeof m?.access_tier === 'string');
  const hasTierField = rawModels.some((m: any) => typeof m?.tier === 'string');
  // Some providers (e.g. Token Harbor) use `tier` for QUALITY levels
  // (high/mid/frontier/low), not access levels (free/paid). Only treat
  // `tier` as an access filter when at least one model actually says
  // tier === 'free'; otherwise fall through to the `:free` suffix check.
  const tierHasFreeValue = hasTierField && rawModels.some((m: any) => m?.tier === 'free');
  if (hasAccessTierField) {
    // Authoritative: the upstream tells us the tier per row. Match on the raw
    // list (which carries the field) and project onto the parsed models.
    const freeIds = new Set<string>();
    for (const m of rawModels) {
      if (m.access_tier === 'free') freeIds.add(m.id);
    }
    const beforeCount = freeModels.length;
    freeModels = freeModels.filter(m => freeIds.has(m.id));
    console.log(`[auto-discover] ${platform}: access_tier filter (${beforeCount} → ${freeModels.length} models)`);
  } else if (tierHasFreeValue) {
    // Build a set of free model ids from the raw response
    const freeIds = new Set<string>();
    for (const m of rawModels) {
      if (m.tier === 'free') freeIds.add(m.id);
    }
    freeModels = models.filter(m => freeIds.has(m.id));
    console.log(`[auto-discover] ${platform}: ${freeIds.size}/${rawModels.length} models are free-tier (${models.length} parsed → ${freeModels.length} after filter)`);
  } else {
    // No tier field, or tier is quality-based (no 'free' value) — check if
    // models use the `:free` suffix convention. If ANY model id ends with
    // ':free', assume this provider uses the pattern and only keep those.
    const hasColonFree = rawModels.some((m: any) => typeof m?.id === 'string' && m.id.endsWith(':free'));
    if (hasColonFree) {
      const beforeCount = freeModels.length;
      freeModels = freeModels.filter(m => m.id.endsWith(':free'));
      console.log(`[auto-discover] ${platform}: :free suffix filter (${beforeCount} → ${freeModels.length} models)`);
    } else {
      // No tier/`:`free signal — check for explicit pricing fields. Some
      // providers (llmtr: pricing.prompt/completion, requesty: input_price/
      // output_price) expose per-model prices; a model is free only when BOTH
      // input and output prices are zero. Only apply this filter when the
      // response actually carries pricing info AND at least one model is free
      // (otherwise the provider may use pricing for something else).
      const hasPricing = rawModels.some((m: any) =>
        (m?.pricing && typeof m.pricing.prompt !== 'undefined') ||
        typeof m?.input_price !== 'undefined'
      );
      if (hasPricing) {
        const isZeroPrice = (v: any): boolean => {
          if (v === undefined || v === null || v === '') return false;
          const n = Number(v);
          return !Number.isNaN(n) && n === 0;
        };
        const isFreeRow = (m: any): boolean => {
          // llmtr style: pricing.prompt + pricing.completion
          if (m?.pricing && typeof m.pricing.prompt !== 'undefined') {
            return isZeroPrice(m.pricing.prompt) && isZeroPrice(m.pricing.completion);
          }
          // requesty style: input_price + output_price
          if (typeof m?.input_price !== 'undefined') {
            return isZeroPrice(m.input_price) && isZeroPrice(m.output_price);
          }
          return false;
        };
        const freeIds = new Set<string>();
        for (const m of rawModels) {
          if (isFreeRow(m)) freeIds.add(m.id);
        }
        if (freeIds.size > 0 && freeIds.size < rawModels.length) {
          const beforeCount = freeModels.length;
          freeModels = freeModels.filter(m => freeIds.has(m.id));
          console.log(`[auto-discover] ${platform}: pricing filter (${beforeCount} → ${freeIds.size} free of ${rawModels.length} total)`);
        }
      }
    }
  }

  // ── Split models by kind ──────────────────────────────────────────
  const chatModels = freeModels.filter(m => !m.kind);
  const embeddingModels = freeModels.filter(m => m.kind === 'embedding');
  const mediaModels = freeModels.filter(m => m.kind && m.kind !== 'embedding');

  if (chatModels.length === 0 && embeddingModels.length === 0 && mediaModels.length === 0) {
    console.log(`[auto-discover] ${platform} has ${freeModels.length} free models but none are registerable — skipping`);
    return empty;
  }

  // ── Verify free ACCESS for chat models only ─────────────────────
  // A tier label is a claim; only a live request is evidence. xkiro labels all
  // five `deepseek/*` rows `access_tier: 'free'` with zero pricing, yet every
  // one answers a free-plan key with 403 "available to paying customers only".
  let verifiedChatModels = chatModels;
  if (hasAccessTierField) {
    const { probeFreeAccess } = await import('../providers/xkiro.js');
    verifiedChatModels = [];
    let paid = 0;
    let gone = 0;
    for (const m of chatModels) {
      const verdict = await probeFreeAccess(apiKey, m.id);
      if (verdict === 'unauthorized') {
        console.log(`[auto-discover] ${platform}: key rejected mid-verification — keeping remaining unverified`);
        verifiedChatModels.push(m);
        continue;
      }
      if (verdict === 'paid') { paid++; continue; }
      if (verdict === 'gone') { gone++; continue; }
      verifiedChatModels.push(m);
    }
    console.log(`[auto-discover] ${platform}: chat access verification — ${verifiedChatModels.length} usable, ${paid} paid-gated, ${gone} gone`);
  }

  // ── Classify model size from name heuristics ──────────────────────
  function classifySize(modelId: string): string {
    const lower = modelId.toLowerCase();
    if (/70b|405b|120b|large|ultra|pro(?!mo)|max/i.test(lower)) return 'Large';
    if (/(?:8|9|14|20|27|32|34)b|medium/i.test(lower)) return 'Medium';
    if (/(?:3|4|7)b|tiny|nano|micro|small|lite|flash/i.test(lower)) return 'Small';
    return 'Medium';
  }

  // ── Prepare statements (all types) ─────────────────────────────
  // P0: rate limits are now platform-specific (see PLATFORM_DEFAULTS above)
  const rates = platformRates(platform);
  // P3: catalog metadata fallback — look up same model_id in catalog
  const lookupCatalogMeta = db.prepare(`
    SELECT rpm_limit, rpd_limit, tpm_limit, tpd_limit, intelligence_rank, speed_rank
    FROM models WHERE model_id = ? AND source = 'catalog' AND enabled = 1
    LIMIT 1
  `);
  const selectExistingChat = db.prepare(
    'SELECT id, source, display_name, context_window, size_label, supports_vision, rpm_limit, rpd_limit, intelligence_rank, speed_rank FROM models WHERE platform = ? AND model_id = ?',
  );
  const insertModel = db.prepare(`
    INSERT INTO models (platform, model_id, display_name, source, enabled,
      intelligence_rank, speed_rank, size_label,
      supports_vision, supports_tools, context_window,
      rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget)
    VALUES (?, ?, ?, 'user', 1,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?)
  `);
  const refreshModel = db.prepare(
    'UPDATE models SET display_name = ?, size_label = ?, supports_vision = ?, supports_tools = ?, context_window = ? WHERE id = ?',
  );
  // P0+P2: upgrade limits/ranks for existing models still on old hardcoded defaults
  const upgradeLimits = db.prepare(
    'UPDATE models SET rpm_limit = ?, rpd_limit = ?, tpm_limit = ?, tpd_limit = ?, intelligence_rank = ?, speed_rank = ?, monthly_token_budget = ? WHERE id = ?',
  );
  const benchModel = db.prepare('UPDATE models SET enabled = 0 WHERE id = ?');

  // Embedding statements
  const selectExistingEmbedding = db.prepare(
    'SELECT id, display_name, dimensions FROM embedding_models WHERE platform = ? AND model_id = ?',
  );
  const insertEmbedding = db.prepare(`
    INSERT INTO embedding_models (family, platform, model_id, display_name, dimensions, max_input_tokens, priority, enabled, quota_label, key_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'auto-discovered', ?)
  `);
  const refreshEmbedding = db.prepare(
    'UPDATE embedding_models SET display_name = ?, dimensions = ?, max_input_tokens = ? WHERE id = ?',
  );

  // Media statements
  const selectExistingMedia = db.prepare(
    'SELECT id, display_name, modality FROM media_models WHERE platform = ? AND model_id = ?',
  );
  const insertMedia = db.prepare(`
    INSERT INTO media_models (platform, model_id, display_name, modality, priority, enabled, quota_label, key_id)
    VALUES (?, ?, ?, ?, ?, 1, 'auto-discovered', ?)
  `);
  const refreshMedia = db.prepare(
    'UPDATE media_models SET display_name = ?, modality = ? WHERE id = ?',
  );

  const maxP = (db.prepare('SELECT COALESCE(MAX(priority), 0) AS mx FROM fallback_config').get() as { mx: number }).mx;
  const insertFb = db.prepare('INSERT INTO fallback_config (model_db_id, priority, enabled) VALUES (?, ?, 1)');

  // ── Transaction: register all model types + quirks ──────────────
  let registered = 0;
  let refreshed = 0;
  let benched = 0;
  const newModelNames: string[] = [];
  const updatedModelNames: string[] = [];
  const retiredModelNames: string[] = [];

  const tx = db.transaction(() => {
    let idx = 0;
    const stillOffered = new Set<number>();

    // ──── 1. CHAT MODELS ────────────────────────────────────────
    for (const m of verifiedChatModels.slice(0, MAX_AUTO_MODELS)) {
      const size = classifySize(m.id);
      const vision = m.vision ? 1 : 0;
      const tools = /gpt|gemini|claude|mistral|qwen|llama.*3|deepseek|command/i.test(m.id) ? 1 : 0;
      const ctx = m.contextWindow ?? 128000;
      const display = m.id.replace(/[-_]/g, ' ');
      const ranks = inferModelRanks(m.id);  // P2: name-based rank inference

      const existing = selectExistingChat.get(platform, m.id) as {
        id: number; source: string; display_name: string | null;
        context_window: number | null; size_label: string | null; supports_vision: number | null;
        rpm_limit: number | null; rpd_limit: number | null;
        intelligence_rank: number | null; speed_rank: number | null;
      } | undefined;

      if (existing) {
        stillOffered.add(existing.id);
        if (existing.source === 'user') {
          // Basic metadata refresh
          const needsRefresh = existing.display_name !== display
            || existing.context_window !== ctx
            || existing.size_label !== size
            || existing.supports_vision !== vision;
          if (needsRefresh) {
            refreshModel.run(display, size, vision, tools, ctx, existing.id);
            refreshed++;
            updatedModelNames.push(m.id);
          }

          // P0+P2: upgrade limits/ranks when still on old hardcoded defaults
          // (rpm=60, rpd=1000 was the previous universal default)
          const onOldDefaults = existing.rpm_limit === 60 && existing.rpd_limit === 1000;
          const onFlatRanks = existing.intelligence_rank != null && existing.speed_rank != null
            && Math.abs(existing.intelligence_rank - existing.speed_rank) <= 2
            && existing.intelligence_rank >= 100 && existing.intelligence_rank <= 100 + 300;
          if (onOldDefaults || onFlatRanks) {
            // Prefer catalog metadata for ranks if available (P3)
            const catMeta = lookupCatalogMeta.get(m.id) as {
              rpm_limit: number | null; rpd_limit: number | null;
              tpm_limit: number | null; tpd_limit: number | null;
              intelligence_rank: number | null; speed_rank: number | null;
            } | undefined;
            const upRpm = catMeta?.rpm_limit ?? rates.rpm;
            const upRpd = catMeta?.rpd_limit ?? rates.rpd;
            const upTpm = catMeta?.tpm_limit ?? rates.tpm;
            const upTpd = catMeta?.tpd_limit ?? rates.tpd;
            const upIntel = catMeta?.intelligence_rank ?? ranks.intelligence;
            const upSpeed = catMeta?.speed_rank ?? ranks.speed;
            // P4: also backfill budget for old models that lack it
            const upBudget = estimateMonthlyBudget(upTpd, upTpm, upRpd);
            upgradeLimits.run(upRpm, upRpd, upTpm, upTpd, upIntel, upSpeed, upBudget, existing.id);
          }
        }
        continue;
      }

      // P3: use catalog metadata as fallback for limits and ranks
      const catalogMeta = lookupCatalogMeta.get(m.id) as {
        rpm_limit: number | null; rpd_limit: number | null;
        tpm_limit: number | null; tpd_limit: number | null;
        intelligence_rank: number | null; speed_rank: number | null;
      } | undefined;

      const finalRpm = catalogMeta?.rpm_limit ?? rates.rpm;
      const finalRpd = catalogMeta?.rpd_limit ?? rates.rpd;
      const finalTpm = catalogMeta?.tpm_limit ?? rates.tpm;
      const finalTpd = catalogMeta?.tpd_limit ?? rates.tpd;
      const finalIntel = catalogMeta?.intelligence_rank ?? ranks.intelligence;
      const finalSpeed = catalogMeta?.speed_rank ?? ranks.speed;
      // P4: auto-estimate monthly_token_budget from rate limits
      const estBudget = estimateMonthlyBudget(finalTpd, finalTpm, finalRpd, finalRpm);

      const info = insertModel.run(
        platform, m.id, display,
        finalIntel, finalSpeed, size,
        vision, tools, ctx,
        finalRpm, finalRpd, finalTpm, finalTpd, estBudget
      );
      const modelDbId = info.lastInsertRowid as number;
      insertFb.run(modelDbId, maxP + 1 + idx);
      ensureModelInProfiles(db, modelDbId);
      stillOffered.add(modelDbId);
      registered++;
      newModelNames.push(m.id);
      idx++;
    }

    // Retire chat rows this platform's discovery created that upstream dropped
    if (stillOffered.size > 0) {
      const ownedRows = db.prepare(
        "SELECT id, model_id FROM models WHERE platform = ? AND source = 'user' AND enabled = 1",
      ).all(platform) as { id: number; model_id: string }[];
      for (const row of ownedRows) {
        if (stillOffered.has(row.id)) continue;
        benchModel.run(row.id);
        benched++;
        retiredModelNames.push(row.model_id);
      }
    }

    // ──── 2. EMBEDDING MODELS ───────────────────────────────────
    let embRegistered = 0;
    let embRefreshed = 0;
    for (const m of embeddingModels.slice(0, MAX_AUTO_MODELS)) {
      const dims = extractDimensions(m.id, rawModels);
      const family = guessEmbeddingFamily(m.id);
      const display = m.id.replace(/[-_]/g, ' ');
      const maxInput = m.contextWindow ?? null;
      const keyId = keyRow.id;

      const existing = selectExistingEmbedding.get(platform, m.id) as {
        id: number; display_name: string | null; dimensions: number;
      } | undefined;

      if (existing) {
        if (existing.display_name !== display || (dims > 0 && existing.dimensions !== dims)) {
          refreshEmbedding.run(display, dims || existing.dimensions, maxInput, existing.id);
          embRefreshed++;
          updatedModelNames.push(m.id);
        }
        continue;
      }

      insertEmbedding.run(family, platform, m.id, display, dims || 0, maxInput, 100 + idx, keyId);
      embRegistered++;
      newModelNames.push(m.id);
      idx++;
    }

    // ──── 3. MEDIA MODELS ───────────────────────────────────────
    let mediaRegistered = 0;
    let mediaRefreshed = 0;
    for (const m of mediaModels.slice(0, MAX_AUTO_MODELS)) {
      const modality = m.kind as string; // 'image' | 'audio' | 'video' | 'transcription'
      const display = m.id.replace(/[-_]/g, ' ');
      const keyId = keyRow.id;

      const existing = selectExistingMedia.get(platform, m.id) as {
        id: number; display_name: string | null; modality: string;
      } | undefined;

      if (existing) {
        if (existing.display_name !== display || existing.modality !== modality) {
          refreshMedia.run(display, modality, existing.id);
          mediaRefreshed++;
          updatedModelNames.push(m.id);
        }
        continue;
      }

      insertMedia.run(platform, m.id, display, modality, 100 + idx, keyId);
      mediaRegistered++;
      newModelNames.push(m.id);
      idx++;
    }

    // ──── 4. AUTO-ASSIGN QUIRKS ─────────────────────────────────
    const quirkCount = autoAssignQuirks(db, platform, freeModels, rawModels);

    // Store counts for return
    (txResult as any)._embRegistered = embRegistered;
    (txResult as any)._embRefreshed = embRefreshed;
    (txResult as any)._mediaRegistered = mediaRegistered;
    (txResult as any)._mediaRefreshed = mediaRefreshed;
    (txResult as any)._quirkCount = quirkCount;
  });

  const txResult = {};
  tx();

  const embRegistered = (txResult as any)._embRegistered ?? 0;
  const embRefreshed = (txResult as any)._embRefreshed ?? 0;
  const mediaRegistered = (txResult as any)._mediaRegistered ?? 0;
  const mediaRefreshed = (txResult as any)._mediaRefreshed ?? 0;
  const quirkCount = (txResult as any)._quirkCount ?? 0;

  // ── P1: Update auto-discovered models from runtime observations ──
  // After insertion, check provider_quota_state for this platform.  If
  // we've observed real rate limits via response headers, use those to
  // update models that still carry the default/initial values.
  try {
    const observed = db.prepare(`
      SELECT metric, MIN(limit_value) AS lim
      FROM provider_quota_state
      WHERE platform = ? AND limit_value IS NOT NULL AND limit_value > 0
      GROUP BY metric
    `).all(platform) as { metric: string; lim: number }[];

    if (observed.length > 0) {
      const metricMap: Record<string, { col: string; defaultVal: number | null }> = {
        rpm:      { col: 'rpm_limit',      defaultVal: rates.rpm },
        rpd:      { col: 'rpd_limit',      defaultVal: rates.rpd },
        tpm:      { col: 'tpm_limit',      defaultVal: rates.tpm },
        tpd:      { col: 'tpd_limit',      defaultVal: rates.tpd },
      };
      let updated = 0;
      for (const { metric, lim } of observed) {
        const spec = metricMap[metric];
        if (!spec) continue;
        // Only update models whose current value matches the initial default
        // (or is NULL).  This avoids overwriting catalog-authored or manually
        // tuned limits.
        if (spec.defaultVal != null) {
          const res = db.prepare(
            `UPDATE models SET ${spec.col} = ? WHERE platform = ? AND source = 'user' AND ${spec.col} = ? AND enabled = 1`
          ).run(lim, platform, spec.defaultVal);
          updated += res.changes;
        }
      }
      if (updated > 0) {
        console.log(`[auto-discover] ${platform}: P1 updated ${updated} model limit(s) from runtime observations`);
      }
    }
  } catch {
    // provider_quota_state may not exist yet or may be empty — non-fatal
  }

  const totalChanges = registered + refreshed + benched + embRegistered + embRefreshed + mediaRegistered + mediaRefreshed;
  if (totalChanges > 0) {
    console.log(
      `[auto-discover] ${platform}: chat ${registered}reg/${refreshed}ref/${benched}ret, ` +
      `embed ${embRegistered}reg/${embRefreshed}ref, media ${mediaRegistered}reg/${mediaRefreshed}ref, ` +
      `${quirkCount} quirks auto-assigned`
    );
  }

  return {
    registered, refreshed, retired: benched,
    embeddingsRegistered: embRegistered, embeddingsRefreshed: embRefreshed,
    mediaRegistered, mediaRefreshed: mediaRefreshed,
    quirksAssigned: quirkCount,
    newModels: newModelNames, updatedModels: updatedModelNames, retiredModels: retiredModelNames,
  };
}

/**
 * Discover models for ALL configured providers that have keys.
 * Called on startup — handles initial registration for platforms with zero
 * models, and also discovers embeddings/media for platforms that only have chat.
 */
export async function autoDiscoverAll(): Promise<void> {
  const db = getDb();
  const configured = db.prepare(`
    SELECT DISTINCT platform FROM api_keys WHERE enabled = 1
  `).all() as { platform: string }[];

  for (const { platform } of configured) {
    if (SKIP_AUTO_DISCOVER.has(platform)) continue;
    // Skip platforms that already have all three model types
    const counts = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM models WHERE platform = ? AND enabled = 1) AS chat,
        (SELECT COUNT(*) FROM embedding_models WHERE platform = ? AND enabled = 1) AS emb,
        (SELECT COUNT(*) FROM media_models WHERE platform = ? AND enabled = 1) AS media
    `).get(platform, platform, platform) as { chat: number; emb: number; media: number };
    if (counts.chat > 0 && counts.emb > 0 && counts.media > 0) continue;

    try {
      await autoDiscoverModels(platform);
    } catch (err) {
      console.warn(`[auto-discover] background discovery for ${platform} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

/**
 * Re-verify every configured platform's roster against its live upstream.
 *
 * A discovery run is a snapshot, and upstream rosters move: models are added,
 * dropped, or flip behind a paid gate without any catalog noticing. This
 * function sweeps ALL model types (chat, embeddings, media) for discovery-owned
 * platforms.
 */
export async function refreshDiscoveredModels(): Promise<void> {
  const db = getDb();
  // Find platforms where ANY table has source='user' rows (chat, embeddings, or media)
  const discoveryOwned = db.prepare(`
    SELECT DISTINCT platform FROM (
      SELECT platform FROM models WHERE source = 'user'
      UNION
      SELECT platform FROM embedding_models WHERE key_id IS NOT NULL
      UNION
      SELECT platform FROM media_models WHERE key_id IS NOT NULL
    )
  `).all() as { platform: string }[];
  const targeted = new Set(discoveryOwned.map(r => r.platform));

  // Platforms whose provider publishes an authoritative `access_tier` are
  // discovery-first by design — xkiro's roster comes from discovery even while
  // its only existing rows are catalog-authored, so a row-source scan alone
  // would skip it forever (the exact gap that let the roster go stale).
  for (const p of configuredPlatforms(db)) {
    const provider = resolveProvider(p as Platform);
    if (provider && (provider as { hasAccessTier?: boolean }).hasAccessTier) targeted.add(p);
  }

  // One bell row per provider that changed, so the entry names WHICH provider
  // gained or lost models. Discovery already runs per platform, so keeping the
  // results keyed by platform is the natural shape — a single rolled-up line
  // across every provider is what made these notifications unreadable.
  const changesByPlatform = new Map<string, { added: string[]; removed: string[] }>();
  const bucket = (platform: string) => {
    const existing = changesByPlatform.get(platform);
    if (existing) return existing;
    const fresh = { added: [] as string[], removed: [] as string[] };
    changesByPlatform.set(platform, fresh);
    return fresh;
  };

  for (const platform of targeted) {
    if (SKIP_AUTO_DISCOVER.has(platform)) continue;
    const hasKey = db.prepare('SELECT 1 FROM api_keys WHERE platform = ? AND enabled = 1 LIMIT 1').get(platform);
    if (!hasKey) continue;
    try {
      const result = await autoDiscoverModels(platform, { refresh: true });
      if (result.registered === 0 && result.retired === 0) continue;
      const entry = bucket(platform);
      entry.added.push(...result.newModels);
      entry.removed.push(...result.retiredModels);
    } catch (err) {
      console.warn(`[auto-discover] refresh for ${platform} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (changesByPlatform.size === 0) return;
  const now = Date.now();
  const notifs: SyncNotification[] = [];
  const names = (list: string[]): string =>
    list.slice(0, DISCOVER_NOTIFICATION_MODELS).join(', ') + (list.length > DISCOVER_NOTIFICATION_MODELS ? '…' : '');

  for (const [platform, change] of changesByPlatform) {
    if (change.added.length > 0) {
      notifs.push({
        id: `discover-${now}-added-${platform}`,
        type: 'added',
        modelId: '*',
        platform,
        displayName: `${change.added.length} model baru`,
        message: names(change.added),
        data: { key: 'notifications.discoverAdded', vars: { count: change.added.length, platform } },
        timestamp: now,
        read: false,
      });
    }
    if (change.removed.length > 0) {
      notifs.push({
        id: `discover-${now}-removed-${platform}`,
        type: 'removed',
        modelId: '*',
        platform,
        displayName: `${change.removed.length} model dihapus`,
        message: names(change.removed),
        data: { key: 'notifications.discoverRemoved', vars: { count: change.removed.length, platform } },
        timestamp: now,
        read: false,
      });
    }
  }
  addNotifications(notifs);
}

function configuredPlatforms(db: Db): string[] {
  return (db.prepare('SELECT DISTINCT platform FROM api_keys WHERE enabled = 1').all() as { platform: string }[])
    .map((r) => r.platform);
}

/** First pass after boot: long enough for the DB and catalog sync to settle,
 *  short enough that a stale roster discovered before restart self-heals in
 *  minutes rather than at the next tick. */
export const MODEL_REFRESH_BOOT_DELAY_MS = 5 * 60 * 1000;

let cancelRefresh: (() => void) | undefined;
let cancelBootRefresh: (() => void) | undefined;
let currentScheduler: Scheduler | null = null;

/**
 * Schedule the recurring roster re-verification.
 * Uses the same configurable interval as catalog sync (sync_interval_hours).
 * When sync schedule is 'off', auto-discover also stops recurring (manual only).
 */
export function startModelRefresh(scheduler: Scheduler): void {
  if (cancelRefresh && cancelBootRefresh) return;
  if (process.env.MODEL_REFRESH_DISABLED === '1') {
    console.log('[auto-discover] refresh disabled via MODEL_REFRESH_DISABLED=1');
    return;
  }
  currentScheduler = scheduler;
  cancelBootRefresh = scheduler.after(MODEL_REFRESH_BOOT_DELAY_MS, () => refreshDiscoveredModels());
  restartRefreshInterval();
}

/** Read the same sync_interval_hours setting used by catalog sync.
 *  Delegates to getSyncIntervalHours() so the default (unset) matches
 *  catalog sync's 12h; only an explicit 0/'off' disables the timer. */
function getAutoDiscoverIntervalMs(): number {
  const hours = getSyncIntervalHours();
  if (hours === 'off') return 0;
  return hours * 60 * 60 * 1000;
}

/** Restart the recurring auto-discover timer (call when sync schedule changes). */
export function restartRefreshInterval(): void {
  if (!currentScheduler) return;
  if (cancelRefresh) { cancelRefresh(); cancelRefresh = undefined; }
  const ms = getAutoDiscoverIntervalMs();
  if (ms > 0) {
    cancelRefresh = currentScheduler.every(ms, () => { void refreshDiscoveredModels(); });
    console.log(`[auto-discover] re-verifying rosters every ${ms / 3600000}h (first pass in ${MODEL_REFRESH_BOOT_DELAY_MS / 60000}min)`);
  } else {
    console.log('[auto-discover] recurring refresh disabled (manual mode)');
  }
}
