import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { routeRequest, setRoutingStrategy, refreshStatsCache } from '../../services/router.js';
import { getDb, initDb } from '../../db/index.js';
import { addToActiveChain } from '../helpers/chain.js';
import * as ratelimit from '../../services/ratelimit.js';
import type { ComplexityLevel } from '../../services/complexity-gate.js';

vi.mock('../../services/ratelimit.js', async () => {
  const actual = await vi.importActual('../../services/ratelimit.js');
  return {
    ...actual,
    canMakeRequest: vi.fn(() => true),
    canUseTokens: vi.fn(() => true),
    isOnCooldown: vi.fn(() => false),
  };
});

vi.mock('../../lib/crypto.js', async () => {
  const actual = await vi.importActual('../../lib/crypto.js');
  return { ...actual, decrypt: vi.fn(() => 'mocked-api-key') };
});

const ORIGINAL_DEV_MODE = process.env.DEV_MODE;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function addModel(opts: {
  platform: string; modelId: string; name: string;
  intelligenceRank: number; speedRank: number; sizeLabel: string; budget: string; priority: number;
}): number {
  const db = getDb();
  db.prepare(`
    INSERT INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, size_label, monthly_token_budget, enabled, supports_vision, supports_tools)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 1)
  `).run(opts.platform, opts.modelId, opts.name, opts.intelligenceRank, opts.speedRank, opts.sizeLabel, opts.budget);
  const id = (db.prepare('SELECT id FROM models WHERE platform = ? AND model_id = ?')
    .get(opts.platform, opts.modelId) as { id: number }).id;
  db.prepare('INSERT INTO fallback_config (model_db_id, priority, enabled) VALUES (?, ?, 1)').run(id, opts.priority);
  addToActiveChain(id, opts.priority);
  db.prepare(`
    INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled)
    VALUES (?, 'k', 'enc', 'iv', 'tag', 'healthy', 1)
  `).run(opts.platform);
  return id;
}

function addHistory(platform: string, modelId: string, opts: {
  successes: number; failures: number; outTokens?: number; latencyMs?: number; ttfbMs?: number | null;
}) {
  const db = getDb();
  const ins = db.prepare(`
    INSERT INTO requests (platform, model_id, key_id, status, input_tokens, output_tokens, latency_ms, error, ttfb_ms)
    VALUES (?, ?, 1, ?, 0, ?, ?, ?, ?)
  `);
  for (let i = 0; i < opts.successes; i++) {
    ins.run(platform, modelId, 'success', opts.outTokens ?? 100, opts.latencyMs ?? 1000, null, opts.ttfbMs ?? null);
  }
  for (let i = 0; i < opts.failures; i++) {
    ins.run(platform, modelId, 'error', 0, opts.latencyMs ?? 1000, 'boom', opts.ttfbMs ?? null);
  }
}

function pickCounts(runs: number, complexity?: ComplexityLevel): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < runs; i++) {
    const r = routeRequest(100, undefined, undefined, false, false, undefined, undefined, false, undefined, 0, undefined, complexity);
    counts[r.modelId] = (counts[r.modelId] ?? 0) + 1;
  }
  return counts;
}

const RUNS = 400;

// Same fixture as router-task-type.test.ts: A is smarter but much slower,
// B is weaker but blazing-fast; reliability and budgets equal, so the ONLY
// differing axes are intelligence and speed. The complexity bias must flip
// the same way the task bias does: hard → smart, trivial → fast.
function seedSmartVsFast() {
  addModel({ platform: 'google', modelId: 'smart', name: 'Smart', intelligenceRank: 1, speedRank: 9, sizeLabel: 'Large', budget: '~50M', priority: 1 });
  addModel({ platform: 'groq', modelId: 'fast', name: 'Fast', intelligenceRank: 2, speedRank: 1, sizeLabel: 'Large', budget: '~50M', priority: 2 });
  addHistory('google', 'smart', { successes: 100, failures: 0, outTokens: 1, latencyMs: 60000, ttfbMs: 4999 });
  addHistory('groq', 'fast', { successes: 100, failures: 0, outTokens: 10000, latencyMs: 100, ttfbMs: 10 });
}

describe('complexity-gate-aware routing (Jev-B threading)', () => {
  beforeEach(() => {
    process.env.DEV_MODE = 'true';
    process.env.NODE_ENV = 'test';
    initDb(':memory:');
    getDb().exec('DELETE FROM fallback_config; DELETE FROM api_keys; DELETE FROM models; DELETE FROM requests;');
    vi.clearAllMocks();
    (ratelimit.canMakeRequest as any).mockReturnValue(true);
    (ratelimit.canUseTokens as any).mockReturnValue(true);
    (ratelimit.isOnCooldown as any).mockReturnValue(false);
  });

  afterEach(() => {
    if (ORIGINAL_DEV_MODE === undefined) delete process.env.DEV_MODE; else process.env.DEV_MODE = ORIGINAL_DEV_MODE;
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('no complexity level: both models keep getting picked', () => {
    seedSmartVsFast();
    setRoutingStrategy('balanced');
    refreshStatsCache(getDb(), true);
    const counts = pickCounts(RUNS);
    expect(counts['smart'] ?? 0).toBeGreaterThan(0);
    expect(counts['fast'] ?? 0).toBeGreaterThan(0);
  });

  it('normal is a no-op (same shape as no level)', () => {
    seedSmartVsFast();
    setRoutingStrategy('balanced');
    refreshStatsCache(getDb(), true);
    const counts = pickCounts(RUNS, 'normal');
    expect(counts['smart'] ?? 0).toBeGreaterThan(0);
    expect(counts['fast'] ?? 0).toBeGreaterThan(0);
  });

  it('hard requests bias toward the smarter (slower) model', () => {
    seedSmartVsFast();
    setRoutingStrategy('balanced');
    refreshStatsCache(getDb(), true);
    const counts = pickCounts(RUNS, 'hard');
    expect(counts['smart'] ?? 0).toBeGreaterThan(counts['fast'] ?? 0);
  });

  it('trivial requests bias toward the faster (cheaper) model', () => {
    seedSmartVsFast();
    setRoutingStrategy('balanced');
    refreshStatsCache(getDb(), true);
    const counts = pickCounts(RUNS, 'trivial');
    expect(counts['fast'] ?? 0).toBeGreaterThan(counts['smart'] ?? 0);
  });

  it('exempt strategies ignore the complexity level', () => {
    seedSmartVsFast();
    setRoutingStrategy('fastest');
    refreshStatsCache(getDb(), true);
    const counts = pickCounts(RUNS, 'hard');
    expect(counts['fast'] ?? 0).toBeGreaterThan(counts['smart'] ?? 0);
  });
});
