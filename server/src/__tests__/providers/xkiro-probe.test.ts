import { describe, it, expect, afterEach, vi } from 'vitest';
import { probeFreeAccess } from '../../providers/xkiro.js';

/**
 * xKiro's published metadata lies in two independent ways (established by live
 * probing, 2026-09-26):
 *
 * 1. The `:free` id suffix covers only 28 of the 58 `access_tier: 'free'`
 *    rows — a suffix-based filter silently drops 30 genuinely free models.
 * 2. All five `deepseek/*` rows claim `access_tier: 'free'` with zero pricing
 *    yet deterministically answer a free key with
 *    `403 "This model is available to paying customers only..."` — no metadata
 *    field (`min_plan_usd`/`min_plan_names` are undefined on exactly them)
 *    separates them, so only a live probe can.
 *
 * These tests pin the probe contract: only a definite paid/gone verdict
 * excludes a model.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('probeFreeAccess — only a definite gate excludes a model', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts a model that answers (200)', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ choices: [{ message: { content: 'hi' } }] }));
    expect(await probeFreeAccess('key', 'cohere/command-a')).toBe('ok');
  });

  it('rejects a paid-gate 403 verbatim', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(
      { error: { message: 'This model is available to paying customers only. Subscribe to a plan or top up your wallet to use it.' } },
      403,
    ));
    expect(await probeFreeAccess('key', 'deepseek/deepseek-v4.1-flash:free')).toBe('paid');
  });

  it('keeps a model on the free-pool 429 (quota spent is not a paid gate)', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(
      { error: { message: "You've reached today's free-model token quota." } },
      429,
    ));
    expect(await probeFreeAccess('key', 'qwen/qwen3.8-max:free')).toBe('unknown');
  });

  it('keeps a model when the upstream is down (503)', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ error: { message: 'A server error occurred.' } }, 503));
    expect(await probeFreeAccess('key', 'minimax/minimax-m2:free')).toBe('unknown');
  });

  it('drops a retired id (404)', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ error: { message: 'Model "x/y" does not exist.' } }, 404));
    expect(await probeFreeAccess('key', 'x/y')).toBe('gone');
  });

  it('treats an unattributable 403 (account-suspend wording) as unknown, not paid', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(
      { error: { message: 'The Free plan is temporarily disabled due to abuse. You can purchase a plan ...' } },
      403,
    ));
    expect(await probeFreeAccess('key', 'a/b')).toBe('unknown');
  });

  it('signals a dead key separately so the sweep stops guessing', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ error: { message: 'Invalid or disabled ClientApiKey' } }, 401));
    expect(await probeFreeAccess('key', 'a/b')).toBe('unauthorized');
  });

  it('returns unknown on a transport failure instead of throwing', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('fetch failed'); });
    expect(await probeFreeAccess('key', 'a/b')).toBe('unknown');
  });

  it('returns unknown when the probe times out', async () => {
    vi.stubGlobal('fetch', async (_url: any, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
    expect(await probeFreeAccess('key', 'slow/model', { timeoutMs: 50 })).toBe('unknown');
  });
});
