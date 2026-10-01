import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { autoDiscoverModels } from '../../services/auto-discover.js';
import { initDb, getDb } from '../../db/index.js';
import { encrypt } from '../../lib/crypto.js';

/**
 * End-to-end discovery for xkiro: tier filter + access verification + the
 * refresh sweep, against a mocked upstream.
 *
 * Regression targets (established by live probing, 2026-09-26):
 *  - a `:free` suffix filter dropped 30 of 58 genuinely free models;
 *  - `deepseek/*` rows claim `access_tier: 'free'` yet 403 "paying customers
 *    only" — a metadata-blind registration ships them, every request burns a
 *    fallback slot, and the router keeps re-picking a model that can never run;
 *  - a roster snapshot never re-ran (auto-discovery gated on zero models), so
 *    a model that flipped paid upstream stayed live forever.
 */

const UPSTREAM_MODELS = [
  { id: 'qwen/qwen3.8-max:free', access_tier: 'free', modality: 'chat', pricing: { input: 0, output: 0 }, context_length: 1_000_000 },
  { id: 'cohere/command-a', access_tier: 'free', modality: 'chat', pricing: { input: 0, output: 0 }, context_length: 128_000 },
  { id: 'mistralai/ministral-3b', access_tier: 'free', modality: 'chat', pricing: { input: 0, output: 0 }, context_length: 128_000 },
  { id: 'deepseek/deepseek-v4.1-flash:free', access_tier: 'free', modality: 'chat', pricing: { input: 0, output: 0 }, context_length: 1_048_576 },
  { id: 'qwen/qwen3.8-max', access_tier: 'premium', modality: 'chat', pricing: { input: 2, output: 6 }, context_length: 1_000_000 },
  { id: 'openai/gpt-6-sol', access_tier: 'paid', modality: 'chat', pricing: { input: 2, output: 8 }, context_length: 400_000 },
  { id: 'minimax/minimax-m2:free', access_tier: 'free', modality: 'chat', pricing: { input: 0, output: 0 }, context_length: 200_000 },
];

const PROBE_RESULTS: Record<string, { status: number; body: unknown }> = {
  'qwen/qwen3.8-max:free': { status: 429, body: { error: { message: "You've reached today's free-model token quota." } } },
  'cohere/command-a': { status: 200, body: { choices: [{ message: { content: 'hi' } }] } },
  'mistralai/ministral-3b': { status: 429, body: { error: { message: "You've reached today's free-model token quota." } } },
  'deepseek/deepseek-v4.1-flash:free': {
    status: 403,
    body: { error: { message: 'This model is available to paying customers only. Subscribe to a plan or top up your wallet to use it.' } },
  },
  'minimax/minimax-m2:free': { status: 503, body: { error: { message: 'A server error occurred.' } } },
};

let upstreamModelList = UPSTREAM_MODELS;

function stubUpstream(): { probeCalls: string[] } {
  const probeCalls: string[] = [];
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    if (href.endsWith('/models')) {
      return new Response(JSON.stringify({ data: upstreamModelList }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
    if (body.model) probeCalls.push(body.model);
    const result = body.model ? PROBE_RESULTS[body.model] : undefined;
    if (!result) return new Response(JSON.stringify({ error: { message: 'unexpected' } }), { status: 500 });
    return new Response(JSON.stringify(result.body), { status: result.status });
  });
  return { probeCalls };
}

function modelRows(): { model_id: string; source: string; enabled: number }[] {
  return getDb().prepare(
    'SELECT model_id, source, enabled FROM models WHERE platform = ? ORDER BY model_id',
  ).all('xkiro') as { model_id: string; source: string; enabled: number }[];
}

describe('xkiro discovery — tier filter + access verification', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    const { encrypted, iv, authTag } = encrypt('xkiro-live-test-key');
    getDb().prepare(`
      INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled)
      VALUES ('xkiro', 'test', ?, ?, ?, 'unknown', 1)
    `).run(encrypted, iv, authTag);
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  beforeEach(() => {
    upstreamModelList = UPSTREAM_MODELS;
    // fallback_config references models(id) without ON DELETE CASCADE, so it
    // must be cleared first; profile_models cascades on delete.
    getDb().prepare(
      "DELETE FROM fallback_config WHERE model_db_id IN (SELECT id FROM models WHERE platform = 'xkiro')",
    ).run();
    getDb().prepare("DELETE FROM models WHERE platform = 'xkiro'").run();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers free models WITHOUT the :free suffix (tier beats suffix)', async () => {
    stubUpstream();
    await autoDiscoverModels('xkiro');

    const ids = modelRows().map((r) => r.model_id);
    // free + suffixed
    expect(ids).toContain('qwen/qwen3.8-max:free');
    // free + NO suffix — the rows a suffix filter used to drop
    expect(ids).toContain('cohere/command-a');
    expect(ids).toContain('mistralai/ministral-3b');
  });

  it('excludes models that claim free tier but require a paid account', async () => {
    stubUpstream();
    await autoDiscoverModels('xkiro');

    const ids = modelRows().map((r) => r.model_id);
    expect(ids).not.toContain('deepseek/deepseek-v4.1-flash:free');
    // and premium/paid never pass the tier filter at all
    expect(ids).not.toContain('qwen/qwen3.8-max');
    expect(ids).not.toContain('openai/gpt-6-sol');
  });

  it('keeps a free model that was merely rate-limited or down during probing', async () => {
    stubUpstream();
    await autoDiscoverModels('xkiro');

    const ids = modelRows().map((r) => r.model_id);
    expect(ids).toContain('minimax/minimax-m2:free'); // 503 upstream
  });

  it('probes every model it registers', async () => {
    const { probeCalls } = stubUpstream();
    await autoDiscoverModels('xkiro');

    const registered = modelRows().map((r) => r.model_id);
    expect(registered.length).toBeGreaterThan(0);
    for (const id of registered) expect(probeCalls).toContain(id);
  });

  it('a refresh re-verifies the roster instead of being gated on zero models', async () => {
    stubUpstream();
    await autoDiscoverModels('xkiro');
    const first = modelRows().length;
    expect(first).toBe(4); // qwen:free, cohere, mistral, minimax (deepseek excluded)

    // Same roster again — without refresh, discovery would bail at the
    // zero-models gate.
    await autoDiscoverModels('xkiro');
    expect(modelRows().length).toBe(first);

    // With refresh: upstream dropped cohere — the row must be retired.
    upstreamModelList = UPSTREAM_MODELS.filter((m) => m.id !== 'cohere/command-a');
    await autoDiscoverModels('xkiro', { refresh: true });

    const rows = modelRows();
    expect(rows.find((r) => r.model_id === 'cohere/command-a')?.enabled).toBe(0);
    expect(rows.length).toBe(first); // benched, not deleted
    // Rows upstream still offers stay enabled.
    expect(rows.find((r) => r.model_id === 'qwen/qwen3.8-max:free')?.enabled).toBe(1);
  });

  it('a model that flips paid upstream gets benched on the next refresh', async () => {
    stubUpstream();
    await autoDiscoverModels('xkiro');
    expect(modelRows().find((r) => r.model_id === 'minimax/minimax-m2:free')?.enabled).toBe(1);

    // The upstream now gates it behind a paid plan.
    PROBE_RESULTS['minimax/minimax-m2:free'] = {
      status: 403,
      body: { error: { message: 'This model is available to paying customers only. Subscribe to a plan or top up your wallet.' } },
    };
    try {
      await autoDiscoverModels('xkiro', { refresh: true });
      expect(modelRows().find((r) => r.model_id === 'minimax/minimax-m2:free')?.enabled).toBe(0);
    } finally {
      PROBE_RESULTS['minimax/minimax-m2:free'] = { status: 503, body: { error: { message: 'A server error occurred.' } } };
    }
  });
});
