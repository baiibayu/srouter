// Migration: seed the local fetch-source registry
// Created: 2026-10-20
//
// DOWN: reversible
//
// The /v1/fetch reader chain used to be one opaque setting (`FETCH_PRIMARY`
// = auto | tinyfish | jina). This seeds the same two readers as first-class
// rows in media_models with modality = 'fetch' — the shape the search engines
// already use — so the dashboard can list them like engines and
// GET /v1/fetch/sources can publish them with an honest `configured` flag.
//
// Their platforms are deliberately NOT in any catalog registry, which is what
// keeps the rows alive across catalog syncs: applyCatalog only writes the
// modalities whose registry is present, and the prune loops are scoped to
// 'search' / 'decision' / 'transcription' / 'image' / 'audio' / 'video'.
//
// Quota labels are the publishers' own numbers, nothing invented:
//   - Jina Reader (r.jina.ai): 20 RPM without an API key — jina.ai/reader.
//   - TinyFish Fetch (api.fetch.tinyfish.ai): free up to 1,000 URLs/day,
//     150 URLs/minute per key — docs.tinyfish.ai/fetch-api/reference.
//
// Column order matters only as the no-override fallback: TinyFish runs first
// when its key is stored, the keyless Jina reader is always the fallback.

import type { Db } from '../types.js';

export const FETCH_MODALITY = 'fetch';
export const FETCH_PRIORITY_OVERRIDES_KEY = 'fetch_source_priority';

interface SeedSource {
  platform: string;
  sourceId: string;
  displayName: string;
  priority: number;
  enabled: number;
  quotaLabel: string;
}

// `enabled` stays 1 for both: TinyFish is skipped by the walker until its key
// lands (configured = false), and Jina answers with no key at all.
const SOURCES: readonly SeedSource[] = [
  { platform: 'tinyfish', sourceId: 'tinyfish-fetch', displayName: 'TinyFish Fetch', priority: 0, enabled: 1, quotaLabel: 'free 1,000 URLs/day · 150 URLs/min' },
  { platform: 'jina', sourceId: 'jina-reader', displayName: 'Jina Reader', priority: 1, enabled: 1, quotaLabel: 'keyless · 20 RPM without a key' },
];

const DEFAULT_ORDER: Record<string, number> = {
  'tinyfish:tinyfish-fetch': 0,
  'jina:jina-reader': 1,
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
    VALUES (?, ?, ?, 'fetch', ?, ?, ?)
  `);
  for (const s of SOURCES) insert.run(s.platform, s.sourceId, s.displayName, s.priority, s.enabled, s.quotaLabel);

  // Same rule as the search engines: a local reorder the operator made always
  // wins over a migration's seed.
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(FETCH_PRIORITY_OVERRIDES_KEY) as { value: string } | undefined;
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(FETCH_PRIORITY_OVERRIDES_KEY, JSON.stringify(DEFAULT_ORDER));
  }
}

export function down(db: Db): void {
  const remove = db.prepare("DELETE FROM media_models WHERE modality = 'fetch' AND platform = ? AND model_id = ?");
  for (const s of SOURCES) remove.run(s.platform, s.sourceId);

  // media_models is AUTOINCREMENT (legacy baseline): rewind the sequence so a
  // re-up lands on the same ids and the round-trip snapshot stays identical.
  db.prepare(`
    DELETE FROM sqlite_sequence
     WHERE name = 'media_models'
       AND seq > COALESCE((SELECT MAX(id) FROM media_models), 0)
  `).run();

  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(FETCH_PRIORITY_OVERRIDES_KEY) as { value: string } | undefined;
  if (row && isSeededOrder(row.value)) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(FETCH_PRIORITY_OVERRIDES_KEY);
  }
}
