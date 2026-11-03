// Migration: remove dead platforms v2 (aclide, blaze, bai, reka, sambanova, ainative)
// Created: 2026-10-30
//
// DOWN: irreversible - deleted rows cannot be reconstructed.
//
// The 2026-10-30 provider audit retired six platforms whose free tiers are dead
// or unverifiable: ACLIDE, BlazeAPI, B.AI (promo only), Reka (prepaid required),
// SambaNova (retired since V23, still present as type remnants), and AINative
// Studio (quota unverified). The Platform union, the keys allowlist, the
// provider registrations and the bundled catalog drop them in the same release;
// this migration purges their rows so the live DB matches the code.
//
// Deletion is PRAGMA table_info-driven: any table carrying a `platform`
// column is cleaned, so schema additions stay covered without edits here.
// `fallback_config` has no platform column but FKs models.id with
// ON DELETE NO ACTION, so it is purged first by subquery.

import type { Db } from '../types.js';

const DEAD_PLATFORMS = ['aclide', 'blaze', 'bai', 'reka', 'sambanova', 'ainative'];

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

  for (const platform of DEAD_PLATFORMS) {
    db.prepare('DELETE FROM quirks WHERE slug LIKE ?').run(`%--${platform}`);
  }
}

export function down(_db: Db): void {
  throw new Error('irreversible migration: removed platform rows cannot be reconstructed');
}
