import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getDb } from '../../db/index.js';
import { encrypt } from '../../lib/crypto.js';
import { mintDashboardToken, isGatedApiPath } from '../helpers/auth.js';

// Budget periods (#1158 follow-up): PATCH budgetPeriod, GET echoes it back
// with a period-correct resetsAt boundary.

let app: Express;
let dashToken = '';

async function request(method: string, path: string, body?: unknown) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as { port: number };
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(isGatedApiPath(path) ? { Authorization: `Bearer ${dashToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  server.close();
  return { status: res.status, body: data as any };
}

function findKey(id: number, list: any[]) {
  return list.find((row: { id: number }) => row.id === id);
}

describe('key budget period API', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    dashToken = mintDashboardToken();
  });

  it('defaults to monthly, round-trips daily/weekly, and rejects unknown periods', async () => {
    const db = getDb();
    const secret = encrypt('sk-period-test');
    const id = Number(db.prepare(`
      INSERT INTO api_keys (platform, encrypted_key, iv, auth_tag, enabled, status)
      VALUES ('groq', ?, ?, ?, 1, 'healthy')
    `).run(secret.encrypted, secret.iv, secret.authTag).lastInsertRowid);

    let list = (await request('GET', '/api/keys')).body;
    let row = findKey(id, list);
    expect(row.budgetPeriod).toBe('monthly');
    expect(Date.parse(row.monthlyUsage.resetsAt)).toBeGreaterThan(Date.now());

    let patch = await request('PATCH', `/api/keys/${id}`, { budgetPeriod: 'daily' });
    expect(patch.status).toBe(200);
    expect(patch.body.budgetPeriod).toBe('daily');
    list = (await request('GET', '/api/keys')).body;
    row = findKey(id, list);
    expect(row.budgetPeriod).toBe('daily');
    // Daily reset lands within the next 24 hours (UTC midnight boundary).
    const dailyReset = Date.parse(row.monthlyUsage.resetsAt);
    expect(dailyReset).toBeGreaterThan(Date.now());
    expect(dailyReset - Date.now()).toBeLessThanOrEqual(24 * 3600_000 + 1000);

    patch = await request('PATCH', `/api/keys/${id}`, { budgetPeriod: 'weekly' });
    expect(patch.status).toBe(200);
    list = (await request('GET', '/api/keys')).body;
    row = findKey(id, list);
    expect(row.budgetPeriod).toBe('weekly');
    // Weekly reset lands within the next 7 days (next Monday, UTC).
    expect(Date.parse(row.monthlyUsage.resetsAt) - Date.now()).toBeLessThanOrEqual(7 * 24 * 3600_000 + 1000);

    const invalid = await request('PATCH', `/api/keys/${id}`, { budgetPeriod: 'hourly' });
    expect(invalid.status).toBe(400);
  });
});
