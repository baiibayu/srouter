// Migration: remove dead/unviable platform router9 (extremely restrictive 5 req/4h limit, duplicate of other free providers)
// Created: 2026-11-12
//
// DOWN: irreversible - deleted rows cannot be reconstructed.

import type { Db } from '../types.js';

const DEAD_PLATFORMS = ['router9'];

export function up(db: Db): void {
  const placeholders = DEAD_PLATFORMS.map(() => '?').join(',');
  const params = [...DEAD_PLATFORMS];

  db.prepare(`
    DELETE FROM fallback_config
     WHERE model_db_id IN (SELECT id FROM models WHERE platform IN (${placeholders}))
  `).run(...params);

  db.prepare(`
    DELETE FROM profile_models
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
    db.prepare('DELETE FROM quirks WHERE slug LIKE ?').run(`${platform}-%`);
  }
}

export function down(_db: Db): void {
  throw new Error('irreversible migration: removed platform rows cannot be reconstructed');
}
