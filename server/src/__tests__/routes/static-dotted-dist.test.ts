import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';

// Regression: `send` (behind res.sendFile / res.download) refuses any path
// containing a dotted segment. express.static never hits this because it passes
// `root` internally, so `/` and /assets/* worked while every SPA deep link
// 404'd — only when the install directory itself contained a dotted segment
// (e.g. `C:\Users\me\.srouter`, the default install location). The older
// static tests all used mkdtemp paths, which have no dotted segment, so they
// passed while the shipped layout was broken.
//
// This suite pins a CLIENT_DIST whose *parent* directory starts with a dot,
// reproducing the shipped layout.
describe('CLIENT_DIST under a dotted directory (send dotfile regression)', () => {
  let dottedRoot: string;
  let distDir: string;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');

    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'freeapi-dot-'));
    // `.srouter` mirrors the real install folder name.
    dottedRoot = path.join(parent, '.srouter');
    distDir = path.join(dottedRoot, 'client', 'dist');
    fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(distDir, 'index.html'),
      '<!doctype html><title>dotted-dist</title>',
    );

    process.env.CLIENT_DIST = distDir;
    server = createApp().listen(0, '127.0.0.1');
    if (!server.listening) await new Promise<void>(r => server.once('listening', () => r()));
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => {
    server.close();
    delete process.env.CLIENT_DIST;
    fs.rmSync(path.dirname(dottedRoot), { recursive: true, force: true });
  });

  it('serves a deep link (not just /)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/keys`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('dotted-dist');
  });

  it('serves other deep links unchanged', async () => {
    for (const route of ['/models/chat', '/analytics', '/settings']) {
      const res = await fetch(`http://127.0.0.1:${port}${route}`);
      expect(res.status, route).toBe(200);
    }
  });

  it('still applies the no-cache policy to deep links', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/keys`);
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });
});
