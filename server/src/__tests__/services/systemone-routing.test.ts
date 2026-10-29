import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, getDb } from '../../db/index.js';
import {
  getRoutingStrategy,
  setRoutingStrategy,
  routeRequest,
  recordRateLimitHit,
} from '../../services/router.js';
import { clearRouterPressure } from '../../services/penalty-inspector.js';
import { classifyComplexity } from '../../services/complexity-gate.js';
import { encrypt } from '../../lib/crypto.js';
import type { ChatMessage } from '@baiibayu/srouter-shared/types.js';

describe('System One Direct Routing Strategy', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    const db = getDb();

    // Insert active keys for platforms so models are routable
    const googleKey = encrypt('test-google-key');
    const orKey = encrypt('test-openrouter-key');
    db.prepare(`
      INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, enabled, status)
      VALUES ('google', 'Google Key', ?, ?, ?, 1, 'healthy'),
             ('openrouter', 'OR Key', ?, ?, ?, 1, 'healthy')
    `).run(googleKey.encrypted, googleKey.iv, googleKey.authTag, orKey.encrypted, orKey.iv, orKey.authTag);
  });

  afterEach(() => {
    setRoutingStrategy('balanced');
    clearRouterPressure();
  });

  it('accepts systemone as a valid routing strategy', () => {
    setRoutingStrategy('systemone');
    expect(getRoutingStrategy()).toBe('systemone');
  });

  it('routes to smartest model when complexity is hard', () => {
    setRoutingStrategy('systemone');
    // Hard prompt: Frontier model (gemini-3.5-flash) is ranked first
    const route = routeRequest(500, undefined, undefined, false, false, undefined, undefined, false, undefined, 0, 'chat', 'hard');
    expect(route.modelId).toBe('gemini-3.5-flash');
    expect(route.platform).toBe('google');
  });

  it('routes to fastest lightweight model when complexity is trivial', () => {
    setRoutingStrategy('systemone');
    // Trivial prompt: Lowest composite model (liquid 1.2b) is ranked first
    const route = routeRequest(500, undefined, undefined, false, false, undefined, undefined, false, undefined, 0, 'chat', 'trivial');
    expect(route.modelId).toBe('liquid/lfm-2.5-1.2b-instruct:free');
    expect(route.platform).toBe('openrouter');
  });

  it('demotes failing models via penalty even in systemone mode', () => {
    setRoutingStrategy('systemone');
    // Penalize gemini-2.5-pro (id 1) heavily with rate limit hits
    recordRateLimitHit(1);
    recordRateLimitHit(1);
    recordRateLimitHit(1);

    // Even on hard prompt, the penalized model is moved down and another model is selected
    const route = routeRequest(500, undefined, undefined, false, false, undefined, undefined, false, undefined, 0, 'chat', 'hard');
    expect(route.modelId).not.toBe('gemini-2.5-pro');
  });

  it('automatically activates complexity classification when strategy is systemone', async () => {
    setRoutingStrategy('systemone');
    const msg: ChatMessage = { role: 'user', content: 'apa itu srouter?' };
    // Heuristic should evaluate short query as trivial even with complexity_gate_enabled = 0
    const level = await classifyComplexity([msg], undefined);
    expect(level).toBe('trivial');
  });
});
