import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import {
  recordRouteTrace,
  getLiveRoutes,
  resetRouteLiveForTest,
} from '../../lib/route-live.js';

// The in-memory tracker behind the dashboard's live routing strip. Two halves:
// the state machine fed by traceRouteEvent, and the /api/analytics/live route
// that serves it behind the dashboard session gate.

async function request(app: Express, path: string, token: string) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as any;
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  server.close();
  return { status: res.status, body };
}

const START = {
  event: 'start' as const,
  requestId: 'req-1',
  attempt: 0,
  platform: 'groq',
  model: 'llama-3.3-70b',
  requestedModel: 'auto',
};

describe('route-live tracker', () => {
  beforeEach(() => {
    resetRouteLiveForTest();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks start → next → ok as one request', () => {
    recordRouteTrace(START);
    let view = getLiveRoutes();
    expect(view.active).toHaveLength(1);
    expect(view.active[0]).toMatchObject({
      platform: 'groq',
      model: 'llama-3.3-70b',
      attempt: 0,
      requestedModel: 'auto',
    });
    expect(view.last).toBeNull();

    recordRouteTrace({ ...START, event: 'next', attempt: 1, platform: 'openrouter', model: 'mimo-v2.6' });
    view = getLiveRoutes();
    expect(view.active).toHaveLength(1);
    expect(view.active[0]).toMatchObject({ platform: 'openrouter', attempt: 1 });

    recordRouteTrace({ ...START, event: 'ok', attempt: 1, platform: 'openrouter', model: 'mimo-v2.6', latencyMs: 1400 });
    view = getLiveRoutes();
    expect(view.active).toHaveLength(0);
    expect(view.last).toMatchObject({
      platform: 'openrouter',
      model: 'mimo-v2.6',
      attempt: 1,
      outcome: 'ok',
      latencyMs: 1400,
    });
  });

  it('records a fail outcome', () => {
    recordRouteTrace(START);
    recordRouteTrace({ ...START, event: 'fail', latencyMs: 250 });
    const view = getLiveRoutes();
    expect(view.active).toHaveLength(0);
    expect(view.last).toMatchObject({ outcome: 'fail', platform: 'groq', latencyMs: 250 });
  });

  it('clears the active entry on a canceled terminal (client hung up)', () => {
    recordRouteTrace(START);
    recordRouteTrace({ ...START, event: 'canceled' });
    const view = getLiveRoutes();
    expect(view.active).toHaveLength(0);
    expect(view.last).toMatchObject({ outcome: 'canceled', platform: 'groq', attempt: 0 });
    // No explicit latencyMs on a cancel: derived from the start timestamp.
    expect(view.last!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('lands a terminal event even when the active entry was already trimmed', () => {
    const now = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now);
    recordRouteTrace(START);
    // A stream longer than MAX_AGE_MS (10 min): the entry is dropped from the
    // active view, but the outcome must still surface as `last`.
    spy.mockReturnValue(now + 11 * 60_000);
    expect(getLiveRoutes().active).toHaveLength(0);
    recordRouteTrace({ ...START, event: 'ok', latencyMs: 11 * 60_000 });
    const view = getLiveRoutes();
    expect(view.active).toHaveLength(0);
    expect(view.last).toMatchObject({ outcome: 'ok', platform: 'groq' });
  });

  it('evicts the oldest active entry past the cap', () => {
    for (let i = 0; i < 40; i++) {
      recordRouteTrace({ ...START, requestId: `req-${i}`, model: `model-${i}` });
    }
    const view = getLiveRoutes();
    expect(view.active).toHaveLength(32);
    // Insertion order: req-0..req-7 were evicted, the oldest survivor is req-8.
    expect(view.active[0].model).toBe('model-8');
  });
});

describe('GET /api/analytics/live', () => {
  let app: Express;
  let dashToken: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    dashToken = mintDashboardToken();
  });

  beforeEach(() => {
    resetRouteLiveForTest();
  });

  it('returns the tracked state behind the dashboard gate', async () => {
    const empty = await request(app, '/api/analytics/live', dashToken);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ active: [], last: null });

    recordRouteTrace(START);
    const busy = await request(app, '/api/analytics/live', dashToken);
    expect(busy.status).toBe(200);
    expect(busy.body.active).toHaveLength(1);
    expect(busy.body.active[0].platform).toBe('groq');
  });

  it('rejects a request without a session', async () => {
    const server = app.listen(0, '127.0.0.1');
    if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
    const addr = server.address() as any;
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/analytics/live`);
    server.close();
    expect(res.status).toBe(401);
  });
});
