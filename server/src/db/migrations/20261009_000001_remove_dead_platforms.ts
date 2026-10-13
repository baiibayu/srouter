// Migration: remove dead platforms (github, cerebras, xai, navy, experiential)
// Created: 2026-10-09
//
// DOWN: irreversible - deleted model/key/usage rows cannot be reconstructed
// (the provider registrations are gone from providers/index.ts too).
//
// The 2026-10 provider audit retired five platforms whose free tiers are dead:
// xAI (paid-only), Cerebras (402 exhausted), GitHub Models (OAuth harness,
// winding down), NavyAI (free plan collapsed) and Experiential Labs (gateway
// shut down). The Platform union, the keys allowlist and the provider
// registrations drop them in the same release; this migration purges their
// rows so a fresh DB (and every upgraded install) matches the code —
// including the bundled baseline, which still seeds cerebras/github models.
//
// Deletion is PRAGMA table_info-driven: any table carrying a `platform`
// column is cleaned, so schema additions stay covered without edits here.
// `fallback_config` has no platform column but FKs models.id with
// ON DELETE NO ACTION, so it is purged first by subquery.

import type { Db } from '../types.js';

const DEAD_PLATFORMS = ['github', 'cerebras', 'xai', 'experiential'];

export function up(db: Db): void {
  const placeholders = DEAD_PLATFORMS.map(() => '?').join(',');
  const params = [...DEAD_PLATFORMS];

  db.prepare(`
    DELETE FROM fallback_config
     WHERE model_db_id IN (SELECT id FROM models WHERE platform IN (${placeholders}))
  `).run(...params);

  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  ).all() as { name: string }[];
  for (const { name } of tables) {
    const columns = db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[];
    if (!columns.some(col => col.name === 'platform')) continue;
    db.prepare(`DELETE FROM ${name} WHERE platform IN (${placeholders})`).run(...params);
  }

  // Auto-detected quirks are scoped as `<detector-slug>--<platform>`; with the
  // target rows gone the scoped definition itself would linger with no way to
  // re-attach it. Global (unscoped) quirks are left alone.
  for (const platform of DEAD_PLATFORMS) {
    db.prepare('DELETE FROM quirks WHERE slug LIKE ?').run(`%--${platform}`);
  }
}

export function down(_db: Db): void {
  throw new Error('irreversible migration: removed platform rows cannot be reconstructed');
}
