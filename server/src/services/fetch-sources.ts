// The /v1/fetch reader chain, as first-class sources (#1174 follow-up).
//
// Fetch sources are media_models rows with modality = 'fetch' (model_id is the
// source id, e.g. 'tinyfish-fetch'), seeded by the 20261020 migration the same
// way the local search engines are. They are the exact readers routes/tools.ts
// walks, in one place, so three surfaces agree:
//
//   - POST /v1/fetch          uses `fetchChainOrder()` (public contract, unchanged)
//   - GET  /api/fetch/config  keeps its old {primary, effective, tinyfishKey}
//                             shape for existing dashboards
//   - GET  /v1/fetch/sources  publishes the registry in the shape of
//                             GET /v1/search/engines
//
// `configured` is computed from the state the reader actually needs:
//   - tinyfish: its account-wide key (shared with search) is stored
//   - jina:     nothing at all — the anonymous reader answers keyless
// A source the operator switched off in the DB never appears in the chain.

import { getDb, getSetting } from '../db/index.js';
import { getTinyfishApiKey, getWebSearchConfig } from './web-search.js';

export const FETCH_MODALITY = 'fetch';
const PRIORITY_OVERRIDES_KEY = 'fetch_source_priority';

/** The two readers routes/tools.ts knows how to call. */
export type FetchSourceId = 'tinyfish' | 'jina';

/**
 * What a source needs before it can answer — the fetch counterpart of the
 * search cards' keyless / keyed / self-hosted split:
 *   - 'none'     nothing at all (Jina Reader's anonymous tier)
 *   - 'key'      a provider key (TinyFish, shared with its search engine)
 *   - 'instance' the operator's own base URL (a future self-hosted reader)
 */
export type FetchSourceAuthKind = 'none' | 'key' | 'instance';

export interface FetchSourceRow {
  id: number;
  platform: string;
  sourceId: string;
  displayName: string;
  priority: number;
  enabled: boolean;
  quotaLabel: string;
  authKind: FetchSourceAuthKind;
  configured: boolean;
}

function sourceKey(platform: string, sourceId: string): string {
  return `${platform}:${sourceId}`;
}

function readPriorityOverrides(): Record<string, number> {
  const raw = getSetting(PRIORITY_OVERRIDES_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** True when this source can answer right now. */
export function isFetchSourceConfigured(platform: string): boolean {
  switch (platform) {
    case 'tinyfish': return getTinyfishApiKey() !== null;
    // Jina Reader's anonymous tier needs no key and no setting.
    case 'jina': return true;
    default: return false;
  }
}

/** What the source needs before it can answer; drives the card's status pill. */
export function fetchSourceAuthKind(platform: string): FetchSourceAuthKind {
  switch (platform) {
    case 'tinyfish': return 'key';
    case 'jina': return 'none';
    default: return 'instance';
  }
}

/** Every fetch source row in effective order (local reorder over column priority). */
export function listFetchSources(): FetchSourceRow[] {
  const overrides = readPriorityOverrides();
  const rows = getDb()
    .prepare(`SELECT id, platform, model_id, display_name, priority, enabled, quota_label
                FROM media_models WHERE modality = ? ORDER BY priority, id`)
    .all(FETCH_MODALITY) as {
      id: number; platform: string; model_id: string; display_name: string;
      priority: number; enabled: number; quota_label: string;
    }[];

  return rows
    .map(row => ({
      id: row.id,
      platform: row.platform,
      sourceId: row.model_id,
      displayName: row.display_name,
      priority: overrides[sourceKey(row.platform, row.model_id)] ?? row.priority,
      enabled: row.enabled === 1,
      quotaLabel: row.quota_label,
      authKind: fetchSourceAuthKind(row.platform),
      configured: isFetchSourceConfigured(row.platform),
    }))
    .sort((a, b) => a.priority - b.priority || a.id - b.id);
}

/**
 * The reader order POST /v1/fetch walks: enabled sources, effective reader
 * first. `preferred` is the legacy GET/PUT /api/fetch/config value
 * ('auto' | 'tinyfish' | 'jina'):
 *   - 'auto'      → the first enabled source that is configured (TinyFish
 *                   while its key is stored, Jina otherwise — the old rule)
 *   - 'tinyfish'  → TinyFish first when its key is stored, else Jina (a pin
 *                   to a reader with no key cannot make it answer)
 *   - 'jina'      → Jina first, explicitly
 * Only readers this binary implements are returned, so a future seeded source
 * cannot make the route call something it cannot speak to.
 */
export function fetchChainOrder(preferred: string = process.env.FETCH_PRIMARY ?? 'auto'): FetchSourceId[] {
  const known: FetchSourceId[] = ['tinyfish', 'jina'];
  const enabled = listFetchSources().filter(s => s.enabled && known.includes(s.platform as FetchSourceId));

  // Rows missing (pre-migration DB): fall back to the historical pair order.
  const sources = enabled.length > 0
    ? enabled
    : known.map(platform => ({ platform, configured: isFetchSourceConfigured(platform) }));

  const pin = preferred.trim() === 'tinyfish' || preferred.trim() === 'jina'
    ? (preferred.trim() as FetchSourceId)
    : null;

  const pinned = pin ? sources.find(s => s.platform === pin) : undefined;
  const effective = pinned && (pin === 'jina' || pinned.configured)
    ? pinned.platform as FetchSourceId
    : (sources.find(s => s.configured)?.platform as FetchSourceId | undefined) ?? 'jina';

  const rest = sources
    .map(s => s.platform as FetchSourceId)
    .filter(platform => platform !== effective);
  return [effective, ...rest];
}

/** Legacy config surface, still served by GET/PUT /api/fetch/config. */
export interface FetchConfigView {
  primary: 'auto' | 'tinyfish' | 'jina';
  effective: FetchSourceId;
  tinyfishKey: boolean;
}

export function resolveFetchConfig(primary: string): FetchConfigView {
  const valid = primary === 'tinyfish' || primary === 'jina' ? primary : 'auto';
  const hasTinyfish = getWebSearchConfig().hasTinyfishKey;
  const effective: FetchSourceId = (valid === 'tinyfish' || valid === 'auto') && hasTinyfish
    ? 'tinyfish'
    : 'jina';
  return { primary: valid, effective, tinyfishKey: hasTinyfish };
}
