// Migration: Conditional & clustered proxy routing
// Created: 2026-10-24
//
// DOWN: reversible
//
// Adds role, targeted_platforms, endpoints, and cluster_index to proxy_pools table
// to support Two-Tier Clustered nodes and Conditional Routing (Primary, Fallback, Targeted).

import type { Db } from '../types.js';

export function up(db: Db): void {
  const columns = (db.prepare('PRAGMA table_info(proxy_pools)').all() as { name: string }[]).map(c => c.name);

  if (!columns.includes('role')) {
    db.exec(`ALTER TABLE proxy_pools ADD COLUMN role TEXT DEFAULT 'primary';`);
  }
  if (!columns.includes('targeted_platforms')) {
    db.exec(`ALTER TABLE proxy_pools ADD COLUMN targeted_platforms TEXT;`);
  }
  if (!columns.includes('endpoints')) {
    db.exec(`ALTER TABLE proxy_pools ADD COLUMN endpoints TEXT;`);
  }
  if (!columns.includes('cluster_index')) {
    db.exec(`ALTER TABLE proxy_pools ADD COLUMN cluster_index INTEGER DEFAULT 0;`);
  }
}

export function down(db: Db): void {
  const columns = (db.prepare('PRAGMA table_info(proxy_pools)').all() as { name: string }[]).map(c => c.name);
  if (columns.includes('cluster_index')) {
    db.exec(`ALTER TABLE proxy_pools DROP COLUMN cluster_index;`);
  }
  if (columns.includes('endpoints')) {
    db.exec(`ALTER TABLE proxy_pools DROP COLUMN endpoints;`);
  }
  if (!columns.includes('targeted_platforms')) {
    db.exec(`ALTER TABLE proxy_pools DROP COLUMN targeted_platforms;`);
  }
  if (columns.includes('role')) {
    db.exec(`ALTER TABLE proxy_pools DROP COLUMN role;`);
  }
}
