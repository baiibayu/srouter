import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getUnifiedApiKey } from '../../db/index.js';
import { setComplexityGate } from '../../services/complexity-gate.js';

// Real global fetch reference so test helper `post` always uses native HTTP fetch,
// even when `vi.stubGlobal('fetch', ...)` mocks upstream Jev calls inside handlers.
const nativeFetch = globalThis.fetch;

async function post(app: Express, path: string, body: any, token?: string) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as any;
  const res = await nativeFetch(`http://127.0.0.1:${addr.port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  server.close();
  let json: any = null;
  try { json = JSON.parse(raw); } catch {}
  return { status: res.status, body: json };
}

describe('POST /v1/decision', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    token = getUnifiedApiKey();
  });

  beforeEach(() => {
    vi.unstubAllGlobals();
    setComplexityGate({ enabled: true, backend: 'jev', jevApiKey: 'test-key', jevBaseUrl: 'https://jev.example' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setComplexityGate({ enabled: false, backend: 'heuristic', jevApiKey: null, jevBaseUrl: null });
  });

  const validRequest = {
    model: 'auto',
    state: 'test state',
    questions: {
      complexity: {
        type: 'choice',
        instructions: 'Rate complexity',
        criteria: ['trivial', 'simple', 'moderate', 'complex', 'expert'],
      },
    },
  };

  it('rejects requests without a valid unified key (401)', async () => {
    expect((await post(app, '/v1/decision', validRequest)).status).toBe(401);
    expect((await post(app, '/v1/decision', validRequest, 'wrong')).status).toBe(401);
  });

  it('rejects an invalid body (missing model) with 422', async () => {
    const invalid = { state: 'test', questions: validRequest.questions };
    expect((await post(app, '/v1/decision', invalid, token)).status).toBe(422);
  });

  it('rejects an invalid body (criteria > 255) with 422', async () => {
    const invalid = { ...validRequest, questions: { complexity: { ...validRequest.questions.complexity, criteria: Array(256).fill('x') } } };
    expect((await post(app, '/v1/decision', invalid, token)).status).toBe(422);
  });

  it('returns a decision response with heuristic source when Jev fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const { status, body } = await post(app, '/v1/decision', validRequest, token);
    expect(status).toBe(200);
    expect(body.object).toBe('decision');
    expect(body.source).toBe('heuristic');
    expect(body.answers).toBeInstanceOf(Array);
    expect(body.answers.length).toBeGreaterThan(0);
    expect(body.tookMs).toBeGreaterThanOrEqual(0);
  });

  it('returns a decision response with heuristic source when Jev times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ ok: false }), 3000))));
    const { status, body } = await post(app, '/v1/decision', validRequest, token);
    expect(status).toBe(200);
    expect(body.source).toBe('heuristic');
  });

  it('returns a decision response with jev source when Jev succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ answers: { complexity: { answer: 'moderate', score: 6 } } }),
    }));
    const { status, body } = await post(app, '/v1/decision', validRequest, token);
    expect(status).toBe(200);
    expect(body.source).toBe('jev');
    expect(body.host).toBe('https://jev.example');
    expect(body.answers[0].answer).toBe('moderate');
    expect(body.answers[0].score).toBe(6);
  });

  it('falls back to heuristic when Jev returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { status, body } = await post(app, '/v1/decision', validRequest, token);
    expect(status).toBe(200);
    expect(body.source).toBe('heuristic');
  });

  it('falls back to heuristic when Jev returns malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ answers: { complexity: { answer: 'x' } } }), // missing score
    }));
    const { status, body } = await post(app, '/v1/decision', validRequest, token);
    expect(status).toBe(200);
    expect(body.source).toBe('heuristic');
  });

  it('sends the correct System One contract to Jev', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ answers: { complexity: { answer: 'simple', score: 4 } } }),
    });
    vi.stubGlobal('fetch', spy);
    await post(app, '/v1/decision', validRequest, token);
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://jev.example/v1/systemone');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body);
    expect(body.model).toBeDefined();
    expect(body.state).toBe('test state');
    expect(body.questions.complexity.type).toBe('choice');
    expect(body.questions.complexity.criteria).toEqual(['trivial', 'simple', 'moderate', 'complex', 'expert']);
  });
});