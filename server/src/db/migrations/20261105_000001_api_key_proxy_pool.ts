import type { Db } from '../types.js';

export function up(db: Db): void {
  const columns = (db.prepare('PRAGMA table_info(api_keys)').all() as { name: string }[]).map(c => c.name);
  if (!columns.includes('proxy_pool_id')) {
    db.prepare('ALTER TABLE api_keys ADD COLUMN proxy_pool_id TEXT DEFAULT NULL').run();
  }
}

export function down(db: Db): void {
  const columns = (db.prepare('PRAGMA table_info(api_keys)').all() as { name: string }[]).map(c => c.name);
  if (columns.includes('proxy_pool_id')) {
    db.prepare('ALTER TABLE api_keys DROP COLUMN proxy_pool_id').run();
  }
}
