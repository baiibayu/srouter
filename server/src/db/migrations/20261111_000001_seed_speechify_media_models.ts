// Migration: seed Speechify audio models (simba-english, simba-multilingual, simba-turbo)
// Created: 2026-11-11
//
// DOWN: reversible
//
// Speechify is registered as a media/TTS platform with its adapter in
// services/media.ts. Seeding these rows locally ensures that when an operator
// registers a Speechify API key, enabledModelCount('speechify') reports models
// available and the key connects cleanly with zero warning notice.

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.prepare(`
    INSERT OR IGNORE INTO media_models (platform, model_id, display_name, modality, priority, enabled, quota_label)
    VALUES
      ('speechify', 'simba-english', 'Speechify Simba English', 'audio', 1, 1, 'Free tier'),
      ('speechify', 'simba-multilingual', 'Speechify Simba Multilingual', 'audio', 2, 1, 'Free tier'),
      ('speechify', 'simba-turbo', 'Speechify Simba Turbo', 'audio', 3, 1, 'Free tier')
  `).run();
}

export function down(db: Db): void {
  db.prepare(`
    DELETE FROM media_models WHERE platform = 'speechify'
  `).run();
}
