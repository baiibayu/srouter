// Migration: decommission dead Webshare proxies
// Created: 2026-11-11
//
// DOWN: irreversible - dead Webshare proxies are removed and cannot be reconstructed.
//
// Decommission dead Webshare SOCKS5 proxies that have invalid credentials
// and cause "Socks5 Authentication failed" on any key using default proxy pool.

import type { Db } from '../types.js';

export function up(db: Db): void {
  // Delete dead Webshare proxy pool nodes
  db.prepare(`
    DELETE FROM proxy_pools 
    WHERE id LIKE 'proxy_ws_%' 
       OR url LIKE 'socks5://wwjbyekw%'
  `).run();

  // If any API key was explicitly bound to a deleted proxy node, reset it to NULL
  db.prepare(`
    UPDATE api_keys 
    SET proxy_pool_id = NULL 
    WHERE proxy_pool_id LIKE 'proxy_ws_%'
  `).run();
}

export function down(_db: Db): void {
  throw new Error('irreversible migration: removed proxy rows cannot be reconstructed');
}
