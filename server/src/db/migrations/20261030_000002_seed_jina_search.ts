// Migration: seed Jina Search engine row (jina-search)
// Created: 2026-10-30
//
// DOWN: reversible
//
// Jina Search (s.jina.ai) is registered as a search-only platform with its own
// adapter in services/search.ts. Its media_models row (modality = "search") is
// catalog-managed like tavily/exa/firecrawl/linkup, but because the hosted
// catalog has not published it yet this migration seeds the row locally so the
// dashboard Models -> Search page and the Keys page list it immediately. The
// adapter exists in this binary, so applyCatalog will adopt/manage the row
// once the catalog publishes it, and the LOCAL_SEARCH_PLATFORMS guard keeps
// the seeded row alive in the meantime.

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.prepare(`
    INSERT OR IGNORE INTO media_models (platform, model_id, display_name, modality, priority, enabled, quota_label)
    VALUES ('jina', 'jina-search', 'Jina Search', 'search', 8, 1, 'free-tier key (1M tokens)')
  `).run();
}

export function down(db: Db): void {
  db.prepare(`
    DELETE FROM media_models WHERE modality = 'search' AND platform = 'jina' AND model_id = 'jina-search'
  `).run();
  db.prepare(`
    DELETE FROM sqlite_sequence
     WHERE name = 'media_models'
       AND seq > COALESCE((SELECT MAX(id) FROM media_models), 0)
  `).run();
}
