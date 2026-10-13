import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { ChatMessage } from '@srouter/shared/types.js';
import { initDb } from '../../db/index.js';
import {
  classifyComplexityHeuristic,
  classifyComplexity,
  getComplexityGate,
  setComplexityGate,
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
    setComplexityGate({ backend: 'jev', jevBaseUrl: 'https://jev.example', jevApiKey: 'secret', jevTimeoutMs: 250 });
    const cfg = getComplexityGate();
    expect(cfg.backend).toBe('jev');
    expect(cfg.jevBaseUrl).toBe('https://jev.example');
    expect(cfg.jevTimeoutMs).toBe(250);
    expect(cfg.hasJevApiKey).toBe(true);

    expect(() => setComplexityGate({ backend: 'nope' as any })).toThrow();
    expect(() => setComplexityGate({ jevTimeoutMs: 10 })).toThrow();
    expect(() => setComplexityGate({ jevTimeoutMs: 99999 })).toThrow();

    setComplexityGate({ jevApiKey: null, jevBaseUrl: null, backend: 'heuristic', jevTimeoutMs: DEFAULT_JEV_TIMEOUT_MS });
    expect(getComplexityGate().hasJevApiKey).toBe(false);
    expect(getComplexityGate().jevBaseUrl).toBe(DEFAULT_JEV_BASE_URL);
    expect(getComplexityGate().jevTimeoutMs).toBe(DEFAULT_JEV_TIMEOUT_MS);
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
    setComplexityGate({ enabled: false, backend: 'heuristic', jevApiKey: null });
  });

  function jevOk(value: number) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ answers: { complexity: { value } } }),
    }));
  }

  it('maps Jev scores to levels (<=3 trivial, >=7 hard)', async () => {
    jevOk(9);
    expect(await classifyComplexity([msg('whatever')], undefined)).toBe('hard');
    jevOk(2);
    expect(await classifyComplexity([msg('whatever')], undefined)).toBe('trivial');
    jevOk(5);
    expect(await classifyComplexity([msg('whatever')], undefined)).toBe('normal');
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
      json: async () => ({ answers: { complexity: { value: 'nonsense' } } }),
    }));
    expect(await classifyComplexity([msg('hi')], undefined)).toBe('trivial');
  });

  it('jev backend without a stored key goes straight to the heuristic (no fetch)', async () => {
    setComplexityGate({ jevApiKey: null });
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    expect(await classifyComplexity([msg('hi')], undefined)).toBe('trivial');
    expect(spy).not.toHaveBeenCalled();
  });
});
