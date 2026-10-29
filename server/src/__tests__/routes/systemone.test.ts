import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getDb, getUnifiedApiKey } from '../../db/index.js';
import { encrypt } from '../../lib/crypto.js';
import { clearAllCooldowns } from '../../services/ratelimit.js';
import { mintDashboardToken } from '../helpers/auth.js';
import { seedDecisionModels } from '../helpers/decision-models.js';

// HTTP surface of System One models: POST /v1/systemone and GET /v1/systemone/models
// for API callers, /api/systemone/* for the dashboard Models → System One page.

const realFetch = globalThis.fetch;
let dashToken = '';

function addKey(platform: string, raw: string): number {
  const { encrypted, iv, authTag } = encrypt(raw);
  const row = getDb().prepare(`
    INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled)
    VALUES (?, 'test', ?, ?, ?, 'healthy', 1)
  `).run(platform, encrypted, iv, authTag);
  return Number(row.lastInsertRowid);
}

async function call(app: Express, method: string, path: string, opts: { body?: unknown; auth?: 'dash' | 'api' | null } = {}) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as any;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = opts.auth === undefined ? (path.startsWith('/api') ? 'dash' : 'api') : opts.auth;
  if (auth === 'dash') headers.Authorization = `Bearer ${dashToken}`;
  if (auth === 'api') headers.Authorization = `Bearer ${getUnifiedApiKey()}`;
  const res = await realFetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const body = await res.json().catch(() => null);
  server.close();
  return { status: res.status, body };
}

const ANSWERS = { tier: { type: 'choice', choice: 'code', probabilities: { light: 0.1, code: 0.9 }, confidence: 0.8 } };
const BODY = {
  state: 'fix: TypeError: Cannot read properties of undefined',
  questions: { tier: { type: 'choice', instructions: 'Which tier?', criteria: { light: 'chat', code: 'coding' } } },
};

describe('systemone routes', () => {
  let app: Express;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    seedDecisionModels();
    clearAllCooldowns(Number.MAX_SAFE_INTEGER);
    app = createApp();
    dashToken = mintDashboardToken();
    addKey('cloudflare', 'acct:tok');

    globalThis.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, result: { answers: ANSWERS, usage: { input_tokens: 10, output_tokens: 2 } } }),
      text: async () => '',
    })) as any;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('runs POST /v1/systemone with an API key', async () => {
    const res = await call(app, 'POST', '/v1/systemone', { body: BODY });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      model: '@cf/cloudflare/clef-flash',
      provider: 'cloudflare',
      answers: ANSWERS,
    });
  });

  it('rejects POST /v1/systemone without an API key', async () => {
    const res = await call(app, 'POST', '/v1/systemone', { body: BODY, auth: null });
    expect(res.status).toBe(401);
  });

  it('GET /v1/systemone/models lists models without leaking keys', async () => {
    const res = await call(app, 'GET', '/v1/systemone/models');
    expect(res.status).toBe(200);
    expect(res.body.object).toBe('list');
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0]).toMatchObject({
      id: '@cf/cloudflare/clef-flash',
      provider: 'cloudflare',
      available: true,
    });
    expect(res.body.data[1]).toMatchObject({
      id: 'inception/mercury-decide:free',
      provider: 'openrouter',
      available: false,
    });
    expect(res.body.data[2]).toMatchObject({
      id: 'typesafe/jev-1.13',
      provider: 'typesafe',
      available: false,
    });
  });

  it('decision models are NOT listed in GET /v1/models (stay separate from chat)', async () => {
    const res = await call(app, 'GET', '/v1/models');
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map(m => m.id);
    expect(ids).not.toContain('@cf/cloudflare/clef-flash');
    expect(ids).not.toContain('inception/mercury-decide:free');
  });

  it('dashboard lists, toggles and tries System One models', async () => {
    const list = await call(app, 'GET', '/api/systemone/models');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(3);
    const id = list.body[1].id;
    const patched = await call(app, 'PATCH', `/api/systemone/models/${id}`, { body: { enabled: false } });
    expect(patched.status).toBe(200);
    expect(patched.body.enabled).toBe(false);

    const tried = await call(app, 'POST', '/api/systemone/try', {
      body: { state: 'my react effect runs twice', question: 'Which tier?', options: ['light', 'code'] },
    });
    expect(tried.status).toBe(200);
    expect(tried.body.provider).toBe('cloudflare');
    const sent = JSON.parse(((globalThis.fetch as any).mock.calls[0][1] as RequestInit).body as string);
    expect(sent.questions).toEqual({ answer: { type: 'choice', instructions: 'Which tier?', criteria: { light: null, code: null } } });
  });

  it('dashboard routes need the dashboard session', async () => {
    const res = await call(app, 'GET', '/api/systemone/models', { auth: null });
    expect(res.status).toBe(401);
  });
});
