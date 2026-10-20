// Migration: seed the four locally-served search engines (#1174 follow-up)
// Created: 2026-10-19
//
// DOWN: reversible
//
// DuckDuckGo, SearXNG, TinyFish and Brave answer through POST /v1/web-search's
// keyless-first walker (services/web-search.ts). They have no adapter in
// services/search.ts, so the catalog's `searchEngines` registry — which only
// publishes engines this binary drives itself — never carries them, yet the
// dashboard's Models → Search page and the Keys page list all eight engines
// in one order. These four need their own media_models rows to appear there.
//
// Their platforms are deliberately NOT in SEARCH_ENGINE_PLATFORMS, which is
// also what keeps the rows alive across catalog syncs: applyCatalog's insert
// loop skips platforms it has no adapter for, and the prune skips them for
// the same reason (services/catalog-sync.ts) — a feed that never mentions
// them can neither update nor remove them.
//
// `priority` (-5..-1) is the no-override fallback that keeps the keyless
// backends ahead of the catalog rows if the settings map below is ever lost.
// -4 is reserved for parallel-search (added by the follow-up migration), so the
// fallback sort itself lands the nine engines in target order.
// The real default order lives in `search_engine_priority`: a settings map
// wins over the column, survives the catalog rewriting ITS rows' priorities,
// and is rewritten wholesale on any local reorder (so seeding it cannot drift
// out of sync with the rows). Seeded only when absent — an operator's own
// reorder always wins over a migration.

import type { Db } from '../types.js';

const PRIORITY_OVERRIDES_KEY = 'search_engine_priority';

interface SeedEngine {
  platform: string;
  engineId: string;
  displayName: string;
  priority: number;
  enabled: number;
  quotaLabel: string;
}

// Column priorities: the keyless backends sort before every catalog row as a
// fallback. Enabled defaults: SearXNG only answers with an instance URL and
// DuckDuckGo is the walker's own first hop — neither is a keyed chain entry,
// so both start off on the card; TinyFish and Brave are free-tier keys the
// operator opts into by storing one (they start on, the walker skips them
// until a key lands).
const ENGINES: readonly SeedEngine[] = [
  { platform: 'duckduckgo', engineId: 'duckduckgo-search', displayName: 'DuckDuckGo Search', priority: -5, enabled: 0, quotaLabel: 'keyless · no account needed' },
  { platform: 'searxng', engineId: 'searxng-search', displayName: 'SearXNG Search', priority: -3, enabled: 0, quotaLabel: 'keyless · no account needed' },
  { platform: 'tinyfish', engineId: 'tinyfish-search', displayName: 'TinyFish Search', priority: -2, enabled: 1, quotaLabel: 'free account key' },
  { platform: 'brave', engineId: 'brave-search', displayName: 'Brave Search', priority: -1, enabled: 1, quotaLabel: 'free-tier key' },
];

// The seven-engine default order (before parallel-search is added) the
// dashboard and the Keys page render: keyless backends first, then the free-tier
// keys from the largest allowance down (TinyFish 12k/day → Exa $10/mo → Brave
// 2k/mo → Tavily 1k/mo), then the two catalog engines the legacy walker never
// reaches. parallel-search (priority -4) is added separately by the following
// migration (20261019_000002) so the isSeededOrder guard can detect whether it
// has already been injected.
const DEFAULT_ORDER: Record<string, number> = {
  'duckduckgo:duckduckgo-search': 0,
  'searxng:searxng-search': 1,
  'tinyfish:tinyfish-search': 2,
  'exa:exa-search': 3,
  'brave:brave-search': 4,
  'tavily:tavily-search': 5,
  'firecrawl:firecrawl-search': 6,
  'linkup:linkup-search': 7,
};

function isSeededOrder(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const keys = Object.keys(DEFAULT_ORDER);
    if (Object.keys(parsed).length !== keys.length) return false;
    return keys.every(k => parsed[k] === DEFAULT_ORDER[k]);
  } catch {
    return false;
  }
}

export function up(db: Db): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO media_models (platform, model_id, display_name, modality, priority, enabled, quota_label)
    VALUES (?, ?, ?, 'search', ?, ?, ?)
  `);
  for (const e of ENGINES) insert.run(e.platform, e.engineId, e.displayName, e.priority, e.enabled, e.quotaLabel);

  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(PRIORITY_OVERRIDES_KEY) as { value: string } | undefined;
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(PRIORITY_OVERRIDES_KEY, JSON.stringify(DEFAULT_ORDER));
  }
}

export function down(db: Db): void {
  const remove = db.prepare("DELETE FROM media_models WHERE modality = 'search' AND platform = ? AND model_id = ?");
  for (const e of ENGINES) remove.run(e.platform, e.engineId);

  // media_models is AUTOINCREMENT (legacy baseline), so deleting the seeds
  // would leave sqlite_sequence 4 higher than max(id) — a re-up would then
  // hand out fresh ids and drift the round-trip snapshot. Rewind the sequence
  // to the surviving rows (nothing at all on a seed-only table).
  db.prepare(`
    DELETE FROM sqlite_sequence
     WHERE name = 'media_models'
       AND seq > COALESCE((SELECT MAX(id) FROM media_models), 0)
  `).run();

  // Drop the settings map only when it still IS the seed: a reorder the
  // operator made (or one this migration never wrote) must survive the rollback.
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(PRIORITY_OVERRIDES_KEY) as { value: string } | undefined;
  if (row && isSeededOrder(row.value)) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(PRIORITY_OVERRIDES_KEY);
  }
}
