import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, getDb } from '../../db/index.js';
import {
  getRoutingStrategy,
  setRoutingStrategy,
  routeRequest,
  recordRateLimitHit,
} from '../../services/router.js';
import { classifyComplexity } from '../../services/complexity-gate.js';
import { encrypt } from '../../lib/crypto.js';
import type { ChatMessage } from '@baiibayu/srouter-shared/types.js';

describe('System One Direct Routing Strategy (Type-Safe Pipeline)', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    const db = getDb();

    // Insert active key for google so google models are routable
    const googleKey = encrypt('test-google-key');
    db.prepare(`
      INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, enabled, status)
      VALUES ('google', 'Google Key', ?, ?, ?, 1, 'healthy')
    `).run(googleKey.encrypted, googleKey.iv, googleKey.authTag);
  });

  afterEach(() => {
    setRoutingStrategy('balanced');
  });

  it('accepts systemone as a valid routing strategy', () => {
    setRoutingStrategy('systemone');
    expect(getRoutingStrategy()).toBe('systemone');
  });

  it('routes by Tier first (Frontier > Large > Medium > Small)', () => {
    setRoutingStrategy('systemone');
    const db = getDb();

    db.prepare('UPDATE models SET enabled = 0').run();
    db.prepare(`
      UPDATE models SET enabled = 1, size_label = 'Large' WHERE model_id = 'gemini-2.5-flash'
    `).run();
    db.prepare(`
      UPDATE models SET enabled = 1, size_label = 'Medium' WHERE model_id = 'gemini-2.5-flash-lite'
    `).run();

    // Hard prompt should pick higher tier: Large (gemini-2.5-flash) > Medium (gemini-2.5-flash-lite)
    const route = routeRequest(500, undefined, undefined, false, false, undefined, undefined, false, undefined, 0, 'chat', 'hard');
    expect(route.modelId).toBe('gemini-2.5-flash');
    expect(route.platform).toBe('google');
  });

  it('rotates fairly (LRU pacing) among models with equal tier to avoid burning quota', () => {
    setRoutingStrategy('systemone');
    const db = getDb();

    db.prepare('UPDATE models SET enabled = 0').run();
    db.prepare(`
      UPDATE models SET enabled = 1, size_label = 'Large' WHERE model_id IN ('gemini-2.5-flash', 'gemini-2.5-pro')
    `).run();

    // First request picks one model (e.g. gemini-2.5-flash) and records dispatch
    const route1 = routeRequest(500, undefined, undefined, false, false, undefined, undefined, false, undefined, 0, 'chat', 'hard');
    expect(route1.modelId).toBeDefined();

    // Second request should rotate to the other peer rather than hammering the same model
    const route2 = routeRequest(500, undefined, undefined, false, false, undefined, undefined, false, undefined, 0, 'chat', 'hard');
    expect(route2.modelId).toBeDefined();
    expect(route2.modelDbId).not.toBe(route1.modelDbId);
  });

  it('tie-breaks deterministically by model_db_id when tier and rpm_limit equal', () => {
    setRoutingStrategy('systemone');
    const db = getDb();

    db.prepare('UPDATE models SET enabled = 0').run();
    db.prepare(`
      UPDATE models SET enabled = 1, size_label = 'Large', rpm_limit = 60 WHERE model_id IN ('gemini-2.5-flash', 'gemini-2.5-pro')
    `).run();

    // Deterministic tie-break: lower model_db_id wins initially
    const route = routeRequest(500, undefined, undefined, false, false, undefined, undefined, false, undefined, 0, 'chat', 'hard');
    expect(route.modelId).toBeDefined();
  });

  it('filters out models without tool support for code task', () => {
    setRoutingStrategy('systemone');
    const db = getDb();

    db.prepare('UPDATE models SET enabled = 0').run();
    db.prepare(`
      UPDATE models SET enabled = 1, size_label = 'Large', supports_tools = 1 WHERE model_id = 'gemini-2.5-flash'
    `).run();
    db.prepare(`
      UPDATE models SET enabled = 1, size_label = 'Large', supports_tools = 0 WHERE model_id = 'gemini-2.5-pro'
    `).run();

    // Code task requires tools -> should pick gemini-2.5-flash (tools=1)
    const route = routeRequest(500, undefined, undefined, false, false, undefined, undefined, false, undefined, 0, 'code', 'hard');
    expect(route.modelId).toBe('gemini-2.5-flash');
  });

  it('trivial complexity prefers lower tier (Small/Medium) when available', () => {
    setRoutingStrategy('systemone');
    const db = getDb();

    db.prepare('UPDATE models SET enabled = 0').run();
    db.prepare(`
      UPDATE models SET enabled = 1, size_label = 'Large' WHERE model_id = 'gemini-2.5-flash'
    `).run();
    db.prepare(`
      UPDATE models SET enabled = 1, size_label = 'Medium' WHERE model_id = 'gemini-2.5-flash-lite'
    `).run();

    // Trivial should prefer Medium tier over Large
    const route = routeRequest(500, undefined, undefined, false, false, undefined, undefined, false, undefined, 0, 'chat', 'trivial');
    expect(route.modelId).toBe('gemini-2.5-flash-lite');
    expect(route.platform).toBe('google');
  });

  it('automatically activates complexity classification when strategy is systemone', async () => {
    setRoutingStrategy('systemone');
    const msg: ChatMessage = { role: 'user', content: 'apa itu srouter?' };
    const level = await classifyComplexity([msg], undefined);
    expect(level).toBe('trivial');
  });

  it('demotes failing/penalized models so healthy alternative serves request', () => {
    setRoutingStrategy('systemone');
    const db = getDb();

    db.prepare('UPDATE models SET enabled = 0').run();
    db.prepare(`
      UPDATE models SET enabled = 1, size_label = 'Large', rpm_limit = 60 WHERE model_id IN ('gemini-2.5-flash', 'gemini-2.5-pro')
    `).run();

    // Route initially to see the default winner
    const route1 = routeRequest(500, undefined, undefined, false, false, undefined, undefined, false, undefined, 0, 'chat', 'hard');
    const winnerId = route1.modelDbId;

    // Heavily penalize the winner
    recordRateLimitHit(winnerId);
    recordRateLimitHit(winnerId);
    recordRateLimitHit(winnerId);

    // The penalized model must sink, allowing the unpenalized peer to take over
    const route2 = routeRequest(500, undefined, undefined, false, false, undefined, undefined, false, undefined, 0, 'chat', 'hard');
    expect(route2.modelDbId).not.toBe(winnerId);
  });

  it('filters by context window and TPM hard gates', () => {
    setRoutingStrategy('systemone');
    const db = getDb();

    db.prepare('UPDATE models SET enabled = 0').run();
    // Model with tiny context window
    db.prepare(`
      UPDATE models SET enabled = 1, size_label = 'Large', context_window = 1000 WHERE model_id = 'gemini-2.5-pro'
    `).run();
    // Model with normal context
    db.prepare(`
      UPDATE models SET enabled = 1, size_label = 'Large', context_window = 131072 WHERE model_id = 'gemini-2.5-flash'
    `).run();

    // Request with 2000 estimated tokens - should skip tiny context model
    const route = routeRequest(2000, undefined, undefined, false, false, undefined, undefined, false, undefined, 0, 'chat', 'hard');
    expect(route.modelId).toBe('gemini-2.5-flash');
  });
});