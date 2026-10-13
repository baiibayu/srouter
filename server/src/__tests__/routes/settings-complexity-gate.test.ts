import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getSetting } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import {
  getComplexityGate, setComplexityGate,
  COMPLEXITY_GATE_ENABLED_KEY, COMPLEXITY_GATE_JEV_KEY_KEY,
  DEFAULT_JEV_BASE_URL, DEFAULT_JEV_TIMEOUT_MS,
} from '../../services/complexity-gate.js';
import { complexityAdjustedWeights, COMPLEXITY_WEIGHT_SHARE } from '../../services/scoring.js';

async function request(app: Express, method: string, path: string, body: any, token: string) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as any;
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  server.close();
  let json: any = null;
  try { json = JSON.parse(raw); } catch {}
  return { status: res.status, body: json };
}

// GET/PUT /api/settings/complexity-gate (Jev-B): opt-in complexity
// classification feeding a soft bandit weight bias; Jev key is write-only.
describe('/api/settings/complexity-gate', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    token = mintDashboardToken();
  });

  it('reports the defaults (disabled, heuristic, no key)', async () => {
    const { status, body } = await request(app, 'GET', '/api/settings/complexity-gate', undefined, token);
    expect(status).toBe(200);
    expect(body).toEqual({
      enabled: false,
      backend: 'heuristic',
      jevBaseUrl: DEFAULT_JEV_BASE_URL,
      jevTimeoutMs: DEFAULT_JEV_TIMEOUT_MS,
      hasJevApiKey: false,
    });
  });

  it('stores and returns a partial update', async () => {
    const put = await request(app, 'PUT', '/api/settings/complexity-gate', { enabled: true, backend: 'jev' }, token);
    expect(put.status).toBe(200);
    expect(put.body.enabled).toBe(true);
    expect(put.body.backend).toBe('jev');
    expect(getSetting(COMPLEXITY_GATE_ENABLED_KEY)).toBe('1');

    const get = await request(app, 'GET', '/api/settings/complexity-gate', undefined, token);
    expect(get.body).toEqual(put.body);
  });

  it('jevApiKey is write-only: set shows hasJevApiKey, GET never echoes it', async () => {
    const put = await request(app, 'PUT', '/api/settings/complexity-gate', { jevApiKey: 'super-secret' }, token);
    expect(put.status).toBe(200);
    expect(put.body.hasJevApiKey).toBe(true);
    expect(put.body.jevApiKey).toBeUndefined();
    expect(getSetting(COMPLEXITY_GATE_JEV_KEY_KEY)).toBe('super-secret');

    const get = await request(app, 'GET', '/api/settings/complexity-gate', undefined, token);
    expect(get.body.jevApiKey).toBeUndefined();
    expect(get.body.hasJevApiKey).toBe(true);

    const clear = await request(app, 'PUT', '/api/settings/complexity-gate', { jevApiKey: null }, token);
    expect(clear.status).toBe(200);
    expect(clear.body.hasJevApiKey).toBe(false);
    expect(getSetting(COMPLEXITY_GATE_JEV_KEY_KEY)).toBeUndefined();
  });

  it('rejects invalid configs', async () => {
    for (const bad of [
      { backend: 'nope' },
      { enabled: 'yes' },
      { jevTimeoutMs: 10 },
      { jevTimeoutMs: 99999 },
      { jevBaseUrl: 'not-a-url' },
    ]) {
      const { status } = await request(app, 'PUT', '/api/settings/complexity-gate', bad, token);
      expect(status).toBe(400);
    }
    // state untouched by the rejections
    expect(getComplexityGate().backend).toBe('jev');
  });

  it('requires auth', async () => {
    const { status } = await request(app, 'GET', '/api/settings/complexity-gate', undefined, 'bad-token');
    expect(status).toBe(401);
  });
});

describe('complexityAdjustedWeights', () => {
  const base = { reliability: 0.5, speed: 0.25, intelligence: 0.25 };

  it('normal is a no-op', () => {
    const out = complexityAdjustedWeights(base, 'normal', 'balanced');
    expect(out.adjusted).toBe(false);
    expect(out.weights).toEqual(base);
  });

  it('trivial moves a share of intelligence onto speed', () => {
    const out = complexityAdjustedWeights(base, 'trivial', 'balanced', 0.5);
    expect(out.adjusted).toBe(true);
    expect(out.weights.speed).toBeCloseTo(0.25 + 0.25 * 0.5);
    expect(out.weights.intelligence).toBeCloseTo(0.25 - 0.25 * 0.5);
    expect(out.weights.reliability).toBe(0.5);
  });

  it('hard moves a share of speed onto intelligence', () => {
    const out = complexityAdjustedWeights(base, 'hard', 'balanced', 0.5);
    expect(out.adjusted).toBe(true);
    expect(out.weights.speed).toBeCloseTo(0.25 - 0.25 * 0.5);
    expect(out.weights.intelligence).toBeCloseTo(0.25 + 0.25 * 0.5);
    expect(out.weights.reliability).toBe(0.5);
  });

  it('exempt strategies are untouched', () => {
    for (const strategy of ['fastest', 'reliable', 'custom'] as const) {
      for (const level of ['trivial', 'hard'] as const) {
        const out = complexityAdjustedWeights(base, level, strategy, 1);
        expect(out.adjusted).toBe(false);
        expect(out.weights).toEqual(base);
      }
    }
  });

  it('share 0 disables the bias; the default share is the documented constant', () => {
    expect(COMPLEXITY_WEIGHT_SHARE).toBeGreaterThan(0);
    expect(complexityAdjustedWeights(base, 'hard', 'balanced', 0).adjusted).toBe(false);
  });
});
