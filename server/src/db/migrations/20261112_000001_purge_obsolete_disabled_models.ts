// Migration: purge obsolete disabled models from models table
// Created: 2026-11-12
//
// DOWN: irreversible - obsolete dead models are pruned and cannot be reconstructed.
//
// Clean out stale / disabled / test mock models on built-in platforms that have
// enabled = 0 and key_id IS NULL, preventing ghost models from showing in model lists
// and test dialogs.

import type { Db } from '../types.js';

export function up(db: Db): void {
  // 1. Clean from fallback_config
  db.prepare(`
    DELETE FROM fallback_config
    WHERE model_db_id IN (
      SELECT id FROM models
      WHERE enabled = 0
        AND key_id IS NULL
        AND platform != 'custom'
    )
  `).run();

  // 2. Clean from profile_models
  db.prepare(`
    DELETE FROM profile_models
    WHERE model_db_id IN (
      SELECT id FROM models
      WHERE enabled = 0
        AND key_id IS NULL
        AND platform != 'custom'
    )
  `).run();

  // 3. Delete from models table
  db.prepare(`
    DELETE FROM models
    WHERE enabled = 0
      AND key_id IS NULL
      AND platform != 'custom'
  `).run();
}

export function down(_db: Db): void {
  throw new Error('irreversible migration: removed obsolete models cannot be reconstructed');
}
