// Migration: Outbound proxy pools with multi-strategy routing
// Created: 2026-10-23
//
// DOWN: reversible
//
// Introduces the proxy_pools table for multi-node proxy support (SOCKS5, HTTP,
// and Fetch-Relay) with round-robin, random, and forward dispatch strategies.

import type { Db } from '../types.js';

export const PROXY_POOLS_STRATEGY_SETTING = 'proxy_pool_strategy';

export function up(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS proxy_pools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      protocol TEXT NOT NULL,
      auth_token TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'untested',
      latency_ms INTEGER,
      last_tested_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_proxy_pools_status ON proxy_pools (enabled, status);
  `);

  const strategyRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(PROXY_POOLS_STRATEGY_SETTING);
  if (!strategyRow) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(PROXY_POOLS_STRATEGY_SETTING, 'round-robin');
  }

  // Migrate legacy single proxy_url if present and not empty
  const legacyUrlRow = db.prepare("SELECT value FROM settings WHERE key = 'proxy_url'").get() as { value: string } | undefined;
  const legacyModeRow = db.prepare("SELECT value FROM settings WHERE key = 'proxy_mode'").get() as { value: string } | undefined;
  const legacyTokenRow = db.prepare("SELECT value FROM settings WHERE key = 'fetch_relay_token'").get() as { value: string } | undefined;
  const legacyEnabledRow = db.prepare("SELECT value FROM settings WHERE key = 'proxy_enabled'").get() as { value: string } | undefined;

  const legacyUrl = (legacyUrlRow?.value ?? '').trim();
  if (legacyUrl) {
    const existing = db.prepare('SELECT id FROM proxy_pools WHERE url = ?').get(legacyUrl);
    if (!existing) {
      const protocol = (legacyModeRow?.value === 'fetch-relay')
        ? 'fetch-relay'
        : (/^socks[45]h?:\/\//i.test(legacyUrl) ? 'socks5' : 'http');
      const now = new Date().toISOString();
      const enabled = legacyEnabledRow?.value === '0' ? 0 : 1;
      db.prepare(`
        INSERT INTO proxy_pools (id, name, url, protocol, auth_token, enabled, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'untested', ?, ?)
      `).run(
        'node_legacy_primary',
        'Primary Proxy',
        legacyUrl,
        protocol,
        legacyTokenRow?.value ?? null,
        enabled,
        now,
        now,
      );
    }
  }
}

export function down(db: Db): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_proxy_pools_status;
    DROP TABLE IF EXISTS proxy_pools;
  `);
  db.prepare('DELETE FROM settings WHERE key = ?').run(PROXY_POOLS_STRATEGY_SETTING);
}
