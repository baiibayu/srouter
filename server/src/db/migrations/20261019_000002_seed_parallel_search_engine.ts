// Migration: seed engine parallel-search (#1174 Phase C unification)
// Created: 2026-10-19
//
// DOWN: reversible

import type { Db } from '../types.js';

const PRIORITY_OVERRIDES_KEY = 'search_engine_priority';

const DEFAULT_ORDER: Record<string, number> = {
  'duckduckgo:duckduckgo-search': 0,
  'parallel:parallel-search': 1,
  'searxng:searxng-search': 2,
  'tinyfish:tinyfish-search': 3,
  'exa:exa-search': 4,
  'brave:brave-search': 5,
  'tavily:tavily-search': 6,
  'firecrawl:firecrawl-search': 7,
  'linkup:linkup-search': 8,
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
  db.prepare(`
    INSERT OR IGNORE INTO media_models (platform, model_id, display_name, modality, priority, enabled, quota_label)
    VALUES (?, ?, ?, 'search', ?, ?, ?)
  `).run('parallel', 'parallel-search', 'Parallel Search', -4, 1, 'free, no key needed');

  // Ensure the settings map includes parallel-search at position 1. A prior
  // migration (20261019_000001) seeded the map without it; an operator's own
  // reorder always wins, so only insert when parallel is absent.
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(PRIORITY_OVERRIDES_KEY) as { value: string } | undefined;
  let order: Record<string, number> = {};
  if (existing) {
    try { order = JSON.parse(existing.value) as Record<string, number>; } catch { /* ignore corrupt */ }
  }
  if (!order['parallel:parallel-search']) {
    // Shift every entry at priority >= 1 up by one and slot parallel in at 1.
    const shifted: Record<string, number> = {};
    for (const [k, v] of Object.entries(order)) {
      shifted[k] = v >= 1 ? v + 1 : v;
    }
    shifted['parallel:parallel-search'] = 1;
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(PRIORITY_OVERRIDES_KEY, JSON.stringify(shifted));
  }
}

export function down(db: Db): void {
  db.prepare("DELETE FROM media_models WHERE modality = 'search' AND platform = ? AND model_id = ?").run('parallel', 'parallel-search');

  db.prepare(`
    DELETE FROM sqlite_sequence
     WHERE name = 'media_models'
       AND seq > COALESCE((SELECT MAX(id) FROM media_models), 0)
  `).run();

  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(PRIORITY_OVERRIDES_KEY) as { value: string } | undefined;
  if (row && isSeededOrder(row.value)) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(PRIORITY_OVERRIDES_KEY);
  }
}
