import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getUnifiedApiKey, getDb, setSetting } from '../../db/index.js';
import { setComplexityGate } from '../../services/complexity-gate.js';
import { DECISION_CHAT_JUDGE_KEY, DECISION_CHAT_JUDGE_ORDER_KEY } from '../../routes/decision.js';

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

// Helper: seed a fake api_keys row so chatJudge picks it up.
// The encryption key is 64 zeroes (set in beforeAll), so we store a dummy
// encrypted blob — but the test mocks provider.chatCompletion anyway, so
// what matters is that the row exists and is enabled/healthy.
function seedApiKey(platform: string, encryptedKey = 'dummy', iv = '000000000000000000000000', authTag = '00000000000000000000000000000000') {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO api_keys (platform, encrypted_key, iv, auth_tag, enabled, status)
    VALUES (?, ?, ?, ?, 1, 'healthy')
  `).run(platform, encryptedKey, iv, authTag);
}

function clearApiKeys(platform: string) {
  getDb().prepare('DELETE FROM api_keys WHERE platform = ?').run(platform);
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
    // Ensure chat-judge is on and uses groq first by default
    setSetting(DECISION_CHAT_JUDGE_KEY, '1');
    setSetting(DECISION_CHAT_JUDGE_ORDER_KEY, JSON.stringify(['groq', 'google', 'openrouter', 'mistral']));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setComplexityGate({ enabled: false, backend: 'heuristic', jevApiKey: null, jevBaseUrl: null });
    clearApiKeys('groq');
    clearApiKeys('google');
    clearApiKeys('openrouter');
    clearApiKeys('mistral');
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

  // ── chatJudge tests ──────────────────────────────────────────────────────────

  it('uses chatJudge when Jev is unavailable (no key) and a provider key exists', async () => {
    // Make Jev unavailable: non-keyless host with no stored key
    setComplexityGate({ enabled: true, backend: 'jev', jevApiKey: null, jevBaseUrl: 'https://jev.example' });

    // Seed a groq key that the chatJudge will find. We need decrypt to return
    // something, so we mock it by mocking the provider directly.
    await import('../../providers/index.js');
    const mockProvider = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{"answer":"moderate","score":7}' } }],
      }),
    };

    // Patch resolveProvider to return our mock when platform is 'groq'
    const providersSpy = vi.spyOn(await import('../../providers/index.js'), 'resolveProvider')
      .mockImplementation((platform: string) => {
        if (platform === 'groq') return mockProvider as any;
        return undefined;
      });

    // Stub the DB key lookup by patching decrypt to return a dummy key
    vi.spyOn(await import('../../lib/crypto.js'), 'decrypt').mockReturnValue('groq-api-key');

    // Seed a fake api_keys row so the SQL query finds something
    seedApiKey('groq');

    // Jev fetch should fail since no key
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const { status, body } = await post(app, '/v1/decision', validRequest, token);

    providersSpy.mockRestore();
    expect(status).toBe(200);
    expect(body.source).toBe('chatJudge');
    expect(body.answers).toBeInstanceOf(Array);
    expect(body.answers[0].score).toBe(7);
    expect(body.answers[0].answer).toBe('moderate');
  });

  it('falls back to heuristic when chatJudge provider throws', async () => {
    setComplexityGate({ enabled: true, backend: 'jev', jevApiKey: null, jevBaseUrl: 'https://jev.example' });

    const providersSpy = vi.spyOn(await import('../../providers/index.js'), 'resolveProvider')
      .mockImplementation((platform: string) => {
        if (platform === 'groq') return {
          chatCompletion: vi.fn().mockRejectedValue(new Error('upstream error')),
        } as any;
        return undefined;
      });

    vi.spyOn(await import('../../lib/crypto.js'), 'decrypt').mockReturnValue('groq-api-key');
    seedApiKey('groq');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const { status, body } = await post(app, '/v1/decision', validRequest, token);

    providersSpy.mockRestore();
    expect(status).toBe(200);
    expect(body.source).toBe('heuristic');
    expect(body.answers).toBeInstanceOf(Array);
    expect(body.answers.length).toBeGreaterThan(0);
  });

  it('falls back to heuristic when chatJudge is disabled via setting', async () => {
    setSetting(DECISION_CHAT_JUDGE_KEY, '0');
    setComplexityGate({ enabled: true, backend: 'jev', jevApiKey: null, jevBaseUrl: 'https://jev.example' });

    seedApiKey('groq');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const { status, body } = await post(app, '/v1/decision', validRequest, token);

    expect(status).toBe(200);
    // chat-judge disabled → must be heuristic
    expect(body.source).toBe('heuristic');
  });

  it('falls back to heuristic when no provider in chatJudge order has a key', async () => {
    setComplexityGate({ enabled: true, backend: 'jev', jevApiKey: null, jevBaseUrl: 'https://jev.example' });

    // Do NOT seed any api_keys rows
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const { status, body } = await post(app, '/v1/decision', validRequest, token);

    expect(status).toBe(200);
    expect(body.source).toBe('heuristic');
  });

  it('chatJudge score parses from plain text via regex fallback', async () => {
    setComplexityGate({ enabled: true, backend: 'jev', jevApiKey: null, jevBaseUrl: 'https://jev.example' });

    const providersSpy = vi.spyOn(await import('../../providers/index.js'), 'resolveProvider')
      .mockImplementation((platform: string) => {
        if (platform === 'groq') return {
          // Return plain text without JSON — regex should extract score=8
          chatCompletion: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'I rate this as complex with a score of 8.' } }],
          }),
        } as any;
        return undefined;
      });

    vi.spyOn(await import('../../lib/crypto.js'), 'decrypt').mockReturnValue('groq-api-key');
    seedApiKey('groq');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const { status, body } = await post(app, '/v1/decision', validRequest, token);

    providersSpy.mockRestore();
    expect(status).toBe(200);
    expect(body.source).toBe('chatJudge');
    expect(body.answers[0].score).toBe(8);
  });

  it('response always has required fields (id, object, created, model, tookMs)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const { status, body } = await post(app, '/v1/decision', validRequest, token);
    expect(status).toBe(200);
    expect(typeof body.id).toBe('string');
    expect(body.id).toMatch(/^dec_/);
    expect(body.object).toBe('decision');
    expect(typeof body.created).toBe('number');
    expect(body.model).toBe('auto');
    expect(typeof body.tookMs).toBe('number');
  });
});
