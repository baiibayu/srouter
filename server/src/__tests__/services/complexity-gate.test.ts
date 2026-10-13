import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { ChatMessage } from '@baiibayu/srouter-shared/types.js';
import { initDb, getDb, getSetting } from '../../db/index.js';
import { encrypt } from '../../lib/crypto.js';
import {
  classifyComplexityHeuristic,
  classifyComplexity,
  getComplexityGate,
  setComplexityGate,
  matchJevPreset,
  JEV_HOST_PRESETS,
  DEFAULT_JEV_BASE_URL,
  DEFAULT_JEV_TIMEOUT_MS,
} from '../../services/complexity-gate.js';

function msg(content: ChatMessage['content']): ChatMessage {
  return { role: 'user', content };
}

describe('complexity gate — heuristic backend (permanent layer)', () => {
  it('short plain prompt is trivial', () => {
    expect(classifyComplexityHeuristic([msg('hi')], undefined)).toBe('trivial');
    expect(classifyComplexityHeuristic([msg('apa itu srouter?')], undefined)).toBe('trivial');
  });

  it('mid-length prompt is normal', () => {
    expect(classifyComplexityHeuristic([msg('y'.repeat(500))], undefined)).toBe('normal');
  });

  it('long prompt (>=4000 chars) is hard', () => {
    expect(classifyComplexityHeuristic([msg('x'.repeat(4000))], undefined)).toBe('hard');
  });

  it('two or more fenced code blocks are hard', () => {
    const fenced = '```\ncode\n```\ntext\n```\nmore\n```';
    expect(classifyComplexityHeuristic([msg(fenced)], undefined)).toBe('hard');
    expect(classifyComplexityHeuristic([msg('single\n```\nblock\n```')], undefined)).toBe('normal');
  });

  it('image parts are never trivial', () => {
    const image = [{ type: 'text', text: 'hi' }, { type: 'image_url', image_url: { url: 'https://x/y.png' } }];
    expect(classifyComplexityHeuristic([msg(image as any)], undefined)).toBe('normal');
  });

  it('tool-bearing turns are never trivial', () => {
    expect(classifyComplexityHeuristic([msg('go')], [{ type: 'function' }])).toBe('normal');
  });

  it('accumulates across messages and never throws on empty input', () => {
    expect(classifyComplexityHeuristic([msg('y'.repeat(300)), msg('y'.repeat(300))], undefined)).toBe('normal');
    expect(classifyComplexityHeuristic(undefined, undefined)).toBe('normal');
    expect(classifyComplexityHeuristic([], [])).toBe('normal');
  });
});

describe('complexity gate — settings + master switch', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
  });

  it('has the verified OpenRouter preset (live 200 on 2026-10-10)', () => {
    const preset = matchJevPreset('https://openrouter.ai');
    expect(preset?.id).toBe('openrouter');
    expect(preset?.model).toBe('typesafe/jev-1.13');
    expect(preset?.provider).toBe('openrouter');
    expect(preset?.systemoneUrl).toBe('https://openrouter.ai/api/v1/systemone');
    // Detection only reports non-keyless presets with a linked provider.
    expect(JEV_HOST_PRESETS.filter(p => p.provider).map(p => p.id)).toEqual(['openrouter']);
  });

  it('is OPT-IN: disabled by default, classify returns undefined', async () => {
    expect(getComplexityGate().enabled).toBe(false);
    expect(await classifyComplexity([msg('hi')], undefined)).toBeUndefined();
  });

  it('enabled gate classifies via heuristic', async () => {
    setComplexityGate({ enabled: true, backend: 'heuristic' });
    expect(await classifyComplexity([msg('hi')], undefined)).toBe('trivial');
    setComplexityGate({ enabled: false });
  });

  it('settings roundtrip + validation', () => {
    setComplexityGate({ backend: 'jev', jevBaseUrl: 'https://jev.example', jevApiKey: 'secret', jevModel: 'my-model', jevTimeoutMs: 250 });
    const cfg = getComplexityGate();
    expect(cfg.backend).toBe('jev');
    expect(cfg.jevBaseUrl).toBe('https://jev.example');
    expect(cfg.jevHostPreset).toBe('custom');
    expect(cfg.jevKeyless).toBe(false);
    expect(cfg.jevModel).toBe('my-model');
    expect(cfg.jevTimeoutMs).toBe(250);
    expect(cfg.hasJevApiKey).toBe(true);

    expect(() => setComplexityGate({ backend: 'nope' as any })).toThrow();
    expect(() => setComplexityGate({ jevTimeoutMs: 10 })).toThrow();
    expect(() => setComplexityGate({ jevTimeoutMs: 99999 })).toThrow();

    setComplexityGate({ jevApiKey: null, jevBaseUrl: null, jevModel: null, backend: 'heuristic', jevTimeoutMs: DEFAULT_JEV_TIMEOUT_MS });
    const reset = getComplexityGate();
    expect(reset.hasJevApiKey).toBe(false);
    expect(reset.jevBaseUrl).toBe(DEFAULT_JEV_BASE_URL);
    expect(reset.jevHostPreset).toBe('zen');
    expect(reset.jevKeyless).toBe(true);
    expect(reset.jevModel).toBe('jev-1.13-free'); // preset default, override cleared
    expect(reset.jevTimeoutMs).toBe(DEFAULT_JEV_TIMEOUT_MS);
  });
});

describe('complexity gate — Jev backend (fail-open to heuristic)', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
  });

  beforeEach(() => {
    setComplexityGate({ enabled: true, backend: 'jev', jevApiKey: 'test-key' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setComplexityGate({ enabled: false, backend: 'heuristic', jevApiKey: null, jevBaseUrl: null, jevModel: null });
  });

  function jevOk(score: number) {
    // Real System One answer: weighted index over the 5 criteria levels (0..4).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ answers: { complexity: { score } } }),
    }));
  }

  it('maps Jev scores to levels (scaled 0..4 -> 0..10; <=3 trivial, >=7 hard)', async () => {
    jevOk(3.6); // 3.6 * 2.5 = 9
    expect(await classifyComplexity([msg('whatever')], undefined)).toBe('hard');
    jevOk(0.5); // 0.5 * 2.5 = 1.25
    expect(await classifyComplexity([msg('whatever')], undefined)).toBe('trivial');
    jevOk(1.6); // 1.6 * 2.5 = 4
    expect(await classifyComplexity([msg('whatever')], undefined)).toBe('normal');
  });

  it('default zen host is keyless: fetches without a stored key, using the free model', async () => {
    setComplexityGate({ jevApiKey: null }); // default base url = zen preset
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ answers: { complexity: { score: 3.6 } } }),
    });
    vi.stubGlobal('fetch', spy);
    expect(await classifyComplexity([msg('hello')], undefined)).toBe('hard');
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://opencode.ai/zen/v1/systemone');
    expect(init.headers.authorization).toBe('Bearer public');
    expect(init.headers['User-Agent']).toContain('opencode/1.18.31');
    expect(init.headers['x-opencode-client']).toBe('desktop');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('jev-1.13-free');
    expect(body.questions.complexity.type).toBe('score');
    expect(body.questions.complexity.criteria).toEqual(['trivial', 'simple', 'moderate', 'complex', 'expert']);
  });

  it('a custom host without a stored key skips the fetch (heuristic only)', async () => {
    setComplexityGate({ jevBaseUrl: 'https://jev.example', jevApiKey: null });
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    expect(await classifyComplexity([msg('hi')], undefined)).toBe('trivial');
    expect(spy).not.toHaveBeenCalled();
  });

  it('a custom host with a stored key sends it as a plain bearer', async () => {
    setComplexityGate({ jevBaseUrl: 'https://jev.example', jevApiKey: 'test-key' });
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ answers: { complexity: { score: 0.2 } } }),
    });
    vi.stubGlobal('fetch', spy);
    expect(await classifyComplexity([msg('hi')], undefined)).toBe('trivial');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://jev.example/v1/systemone');
    expect(init.headers.authorization).toBe('Bearer test-key');
    expect(init.headers['User-Agent']).toBeUndefined();
  });

  it('a detected host borrows the linked provider key at call time (nothing stored)', async () => {
    const enc = encrypt('provider-key-123');
    getDb()
      .prepare('INSERT INTO api_keys (platform, encrypted_key, iv, auth_tag) VALUES (?, ?, ?, ?)')
      .run('openrouter', enc.encrypted, enc.iv, enc.authTag);
    try {
      setComplexityGate({ jevBaseUrl: 'https://openrouter.ai', jevApiKey: null });
      const cfg = getComplexityGate();
      expect(cfg.detectedHosts).toEqual(['openrouter']);
      expect(cfg.hasJevApiKey).toBe(true); // borrowed, not stored
      expect(cfg.jevKeyStored).toBe(false);

      const spy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ answers: { complexity: { score: 3.6 } } }),
      });
      vi.stubGlobal('fetch', spy);
      expect(await classifyComplexity([msg('hello')], undefined)).toBe('hard');
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://openrouter.ai/api/v1/systemone');
      expect(init.headers.authorization).toBe('Bearer provider-key-123');
      // The gate key setting stays empty — the borrow happens per call.
      expect(getSetting('complexity_gate_jev_api_key')).toBeUndefined();
    } finally {
      getDb().prepare('DELETE FROM api_keys').run();
      vi.unstubAllGlobals();
      setComplexityGate({ jevBaseUrl: null, jevApiKey: null });
    }
  });

  it('a Jev HTTP error falls back to the heuristic', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await classifyComplexity([msg('hi')], undefined)).toBe('trivial');
  });

  it('a Jev network failure falls back to the heuristic', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    expect(await classifyComplexity([msg('hi')], undefined)).toBe('trivial');
  });

  it('a malformed Jev response falls back to the heuristic', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ answers: { complexity: { score: 'nonsense' } } }),
    }));
    expect(await classifyComplexity([msg('hi')], undefined)).toBe('trivial');
  });
});
