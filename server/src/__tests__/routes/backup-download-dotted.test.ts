import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';

// Regression: res.download funnels into `send`, which refuses any path with a
// dotted segment. Backups live beside the database file, so an install under a
// dotted directory (e.g. `C:\Users\me\.srouter`) made every backup download
// 404 even though the file existed. Passing the basename with an explicit
// `root` keeps the inspected portion dot-free.
//
// Fixtures here deliberately nest the data directory under a dotted parent; the
// main backups suite uses a plain mkdtemp path and so never exercised this.
describe('Backup download under a dotted data directory', () => {
  let app: Express;
  let dottedDataDir: string;
  let dashToken: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'srouter-dot-backup-'));
    dottedDataDir = path.join(parent, '.srouter', 'server', 'data');
    fs.mkdirSync(dottedDataDir, { recursive: true });
    process.env.SROUTER_DB_PATH = path.join(dottedDataDir, 'srouter.db');

    initDb(':memory:');
    app = createApp();
    dashToken = mintDashboardToken();
  });

  afterAll(() => {
    delete process.env.SROUTER_DB_PATH;
    fs.rmSync(path.dirname(path.dirname(path.dirname(dottedDataDir))), {
      recursive: true,
      force: true,
    });
  });

  it('downloads a backup created under a dotted directory', async () => {
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    const created = await fetch(`http://127.0.0.1:${port}/api/backups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dashToken}` },
      body: JSON.stringify({}),
    });
    const payload = await created.json();
    expect(created.status).toBe(201);
    const id = payload.backup.id as number;

    const res = await fetch(`http://127.0.0.1:${port}/api/backups/${id}/download`, {
      headers: { Authorization: `Bearer ${dashToken}` },
    });
    const text = await res.text();
    server.close();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    // A real dump, not an error page that happens to carry a 200.
    expect(text).toContain('INSERT INTO');
  });
});
