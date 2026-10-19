import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDb, getDb } from '../../db/index.js';
import { runFallbackLoop, newFallbackState, type FallbackState } from '../../lib/fallback-loop.js';
import { isHedgeAbortError, newHedgeAbortError, isClientAbortError, isRetryableError } from '../../lib/error-classify.js';
import { acquireLease, releaseLease, resetLeases } from '../../services/ratelimit.js';
import type { RouteResult } from '../../services/router.js';

/**
 * Fallback-v2 hedging: when the wall-clock retry budget expires MID-FLIGHT,
 * the loop calls abortInFlight() so a stalled attempt is abandoned instead of
 * only refusing to start the next retry behind it. The surface aborts its
 * composed fetch signal with newHedgeAbortError(); the loop must render
 * timedOut exhaustion, and the provider-health bookkeeping — cooldown, skip
 * entry, logFailure row — depends on WHOSE silence spent the budget: an attempt
 * handed only the scraps a ladder left is not benched, one that stayed silent
 * for most of the whole budget is.
 *
 * Every timing-dependent test below runs under vitest fake timers. The loop's
 * budget clock is Date.now() (fallback-loop.ts: startedAt at :1361, budget
 * checks at :1426/:1455, remaining-budget hedge timer via setTimeout at
 * :1508-:1513) — both Date and setTimeout are mocked by vi.useFakeTimers() by
 * default (vitest 3), so the ladder sleeps, the wall-clock budget and the
 * hedge timer all ride ONE virtual clock: zero drift, immune to the event
 * loop stalls that made the real-timer version flaky under full-suite CPU
 * load. The classification test at the top is synchronous and untimed; it
 * keeps real timers.
 */

// Start the loop (it runs synchronously until it suspends on a dispatch's
// pending timer or rejection), drive the virtual clock through every timer the
// scenario schedules — advanceTimersByTimeAsync fires them in order and
// flushes the promise chain between firings, so each retry's next timer is
// registered before the clock reaches its deadline — then collect the settled
// loop. The horizon only needs to cover the scenario's last timer; advancing
// past a settled loop is a harmless clock bump.
async function advanceAndSettle(loop: Promise<void>, horizonMs: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(horizonMs);
  await loop;
}

let keySeq = 900;
function leasedRoute(): { route: RouteResult; keyId: number } {
  const keyId = ++keySeq;
  const id = acquireLease('fake', 'fake-model', keyId, 100);
  return {
    keyId,
    route: {
      provider: {} as any,
      modelId: 'fake-model',
      modelDbId: 900000 + keyId,
      apiKey: 'test-key',
      keyId,
      platform: 'fake',
      displayName: 'Fake Model',
      rpdLimit: null,
      tpdLimit: null,
      release: () => releaseLease(id),
    },
  };
}

function hooks(state: FallbackState, overrides: Record<string, unknown>) {
  return {
    state,
    timeBudgetMs: 0,
    logFailure: vi.fn(),
    onFatal: vi.fn(),
    onRoutingExhausted: vi.fn(),
    onExhausted: vi.fn(),
    ...overrides,
  } as any;
}

// An upstream that hangs until the composed signal aborts, then rejects with
// the marked hedge error — mirrors what a real fetch does when the surface
// aborts its signal via abortInFlight().
function stalledDispatch(hedgeAbort: AbortController) {
  return async (): Promise<never> => {
    return await new Promise((_resolve, reject) => {
      hedgeAbort.signal.addEventListener('abort', () => reject(newHedgeAbortError()), { once: true });
    });
  };
}

describe('fallback loop time-budget hedging', () => {
  beforeEach(() => {
    initDb(':memory:');
    resetLeases();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Timed tests install fake timers per-test; never leak them (or their
    // pending virtual timers) into the next case or the next file.
    vi.useRealTimers();
    resetLeases();
    vi.restoreAllMocks();
  });

  it('classifies the hedge error as budget-abort, not retryable or client-abort', () => {
    const err = newHedgeAbortError();
    expect(isHedgeAbortError(err)).toBe(true);
    // Must never enter the retryable ladder as a provider failure.
    expect(isRetryableError(err)).toBe(false);
    // Distinct from the client-disconnect abort — different branch in the loop.
    expect(isClientAbortError(err)).toBe(false);
  });

  it('aborts the stalled in-flight attempt when the budget expires, rendering timedOut exhaustion', async () => {
    vi.useFakeTimers();
    const state = newFallbackState();
    const hedgeAbort = new AbortController();
    // Virtual timeline (the fake clock only moves when advanced): the first
    // two attempts (the initial one and the #751-exempt first retry) each
    // sleep 30ms and throw retryable 429s, so the third attempt starts at
    // exactly t=60 with 140ms of the 200ms budget left; it hangs, the hedge
    // timer (armed for the remaining budget) aborts it at exactly t=200. The
    // stall owned 140ms of the 200ms budget, short of
    // HEDGE_BENCH_MIN_SILENT_FRACTION (0.75 → 150ms), so the no-bench
    // assertions below are exact, not a race against cold-start overhead the
    // way they were under real timers.
    const dispatch = vi.fn()
      .mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 30));
        throw Object.assign(new Error('fake API error 429: rate limit'), { status: 429 });
      })
      .mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 30));
        throw Object.assign(new Error('fake API error 429: rate limit'), { status: 429 });
      })
      .mockImplementation(stalledDispatch(hedgeAbort));

    const h = hooks(state, {
      maxRetries: 5,
      timeBudgetMs: 200,
      abortInFlight: () => hedgeAbort.abort(newHedgeAbortError()),
      route: () => leasedRoute().route,
      dispatch,
    });

    await advanceAndSettle(runFallbackLoop(h), 250);

    // The stalled attempt was abandoned mid-flight; the budget is spent, so
    // no fourth attempt starts.
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(h.onExhausted).toHaveBeenCalledTimes(1);
    expect(h.onExhausted.mock.calls[0][1].timedOut).toBe(true);
    // The two quick 429 failures were logged as failures; the hedge abort of
    // the third attempt must NOT add a third logFailure row, and there is no
    // fatal render or routing-exhaustion render.
    expect(h.logFailure).toHaveBeenCalledTimes(2);
    expect(h.onFatal).not.toHaveBeenCalled();
    expect(h.onRoutingExhausted).not.toHaveBeenCalled();
  });

  it('the hedge abort adds no cooldown, no skip, no extra failure beyond the retryable attempts', async () => {
    vi.useFakeTimers();
    const state = newFallbackState();
    const hedgeAbort = new AbortController();
    // Same ladder shape as above (virtual clock): two 30ms retryable 429s put
    // the third attempt in flight at t=60 with 40ms of the 100ms budget left;
    // the hedge abort lands at exactly t=100. Hedging only arms for
    // attempt > 1 (the first attempt and the first retry always run — #751).
    const dispatch = vi.fn()
      .mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 30));
        throw Object.assign(new Error('fake API error 429: rate limit'), { status: 429 });
      })
      .mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 30));
        throw Object.assign(new Error('fake API error 429: rate limit'), { status: 429 });
      })
      .mockImplementation(stalledDispatch(hedgeAbort));

    const h = hooks(state, {
      maxRetries: 5,
      timeBudgetMs: 100,
      abortInFlight: () => hedgeAbort.abort(newHedgeAbortError()),
      route: () => leasedRoute().route,
      dispatch,
    });
    await advanceAndSettle(runFallbackLoop(h), 150);

    // The two 429s each produced their normal failure bookkeeping (a cooldown
    // row and a skip entry); the hedge abort must NOT add a third of either —
    // the budget expiring is not a provider-health signal.
    const cooldowns = getDb().prepare('SELECT COUNT(*) AS n FROM rate_limit_cooldowns').get() as { n: number };
    expect(cooldowns.n).toBe(2);
    expect(state.skipKeys.size).toBe(2);
    expect(state.skipModels.size).toBe(0);
    expect(h.logFailure).toHaveBeenCalledTimes(2);
    // And the request rendered as timedOut exhaustion, not a third failure.
    expect(h.onExhausted).toHaveBeenCalledTimes(1);
    expect(h.onExhausted.mock.calls[0][1].timedOut).toBe(true);
  });

  it('benches the route when one attempt stayed silent for the whole budget', async () => {
    // The production shape behind this branch. Same ladder position as the two
    // tests above — hedging only arms from the third attempt on (#751) — but
    // here the two failures ahead of it are INSTANT (no timers, microtasks
    // only on the virtual clock), so the stalled attempt inherits essentially
    // the whole 100ms budget (hedge abort at exactly t=100, attempt start at
    // t=0) and then sends no first byte for all of it. That is a stalled
    // upstream, not a scheduling accident: unbenched it stays at the head of
    // the route order and re-stalls every subsequent request, burning the
    // full budget each time while the healthy routes queued behind it never
    // run.
    vi.useFakeTimers();
    const state = newFallbackState();
    const hedgeAbort = new AbortController();
    const fast429 = async () => {
      throw Object.assign(new Error('fake API error 429: rate limit'), { status: 429 });
    };
    const dispatch = vi.fn()
      .mockImplementationOnce(fast429)
      .mockImplementationOnce(fast429)
      .mockImplementation(stalledDispatch(hedgeAbort));

    const h = hooks(state, {
      maxRetries: 5,
      timeBudgetMs: 100,
      abortInFlight: () => hedgeAbort.abort(newHedgeAbortError()),
      route: () => leasedRoute().route,
      dispatch,
    });

    await advanceAndSettle(runFallbackLoop(h), 150);

    // Still a timedOut exhaustion — the render is unchanged.
    expect(h.onExhausted).toHaveBeenCalledTimes(1);
    expect(h.onExhausted.mock.calls[0][1].timedOut).toBe(true);
    // But the stalled route now carries a cooldown and a skip entry of its own,
    // on top of the two fast 429s', so the next request routes past it. This is
    // the exact assertion that inverts for the shared-budget case above, where
    // the same three attempts produce only two of each.
    const cooldowns = getDb().prepare('SELECT COUNT(*) AS n FROM rate_limit_cooldowns').get() as { n: number };
    expect(cooldowns.n).toBe(3);
    expect(state.skipKeys.size).toBe(3);
    expect(h.logFailure).toHaveBeenCalledTimes(3);
  });

  it('never cancels an attempt that already committed, however long it then runs', async () => {
    // The whole point of the hedge is to kill a SILENT attempt. Once a stream
    // has flushed its headers the answer is already reaching the client and the
    // loop could not fail over anyway, so cancelling would truncate a healthy
    // response for nothing. Slow != stalled.
    vi.useFakeTimers();
    const state = newFallbackState();
    const abortInFlight = vi.fn();
    const dispatch = vi.fn()
      .mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 30));
        throw Object.assign(new Error('fake API error 429: rate limit'), { status: 429 });
      })
      .mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 30));
        throw Object.assign(new Error('fake API error 429: rate limit'), { status: 429 });
      })
      // Third attempt commits immediately (disarmHedge clears the virtual
      // hedge timer before it can ever fire), then keeps streaming well past
      // the 100ms budget — exactly the slow-but-healthy generation that used
      // to be truncated at the budget.
      .mockImplementation(async (_route: unknown, _attempt: number, ctx: { disarmHedge: () => void }) => {
        ctx.disarmHedge();
        await new Promise(r => setTimeout(r, 250));
        return 'committed';
      });

    const h = hooks(state, {
      maxRetries: 5,
      timeBudgetMs: 100,
      abortInFlight,
      route: () => leasedRoute().route,
      dispatch,
    });

    // Virtual timeline: 30ms + 30ms ladder, then the committed attempt's
    // 250ms stream ends at t=310.
    await advanceAndSettle(runFallbackLoop(h), 350);

    expect(dispatch).toHaveBeenCalledTimes(3);
    // The committed attempt outlived the budget and was left alone.
    expect(abortInFlight).not.toHaveBeenCalled();
    expect(h.onExhausted).not.toHaveBeenCalled();
    expect(h.onFatal).not.toHaveBeenCalled();
    // Only the two real 429s were booked as failures.
    expect(h.logFailure).toHaveBeenCalledTimes(2);
  });

  it('still aborts when the attempt stays silent past the budget', async () => {
    // The complement of the test above: no disarmHedge call (nothing was ever
    // flushed), so the stalled attempt is still cancelled — the hedge timer
    // (armed for the remaining 40ms of the 100ms budget) fires at exactly
    // t=100 on the virtual clock and calls abortInFlight exactly once.
    vi.useFakeTimers();
    const state = newFallbackState();
    const hedgeAbort = new AbortController();
    const abortInFlight = vi.fn(() => hedgeAbort.abort(newHedgeAbortError()));
    const dispatch = vi.fn()
      .mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 30));
        throw Object.assign(new Error('fake API error 429: rate limit'), { status: 429 });
      })
      .mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 30));
        throw Object.assign(new Error('fake API error 429: rate limit'), { status: 429 });
      })
      .mockImplementation(stalledDispatch(hedgeAbort));

    const h = hooks(state, {
      maxRetries: 5,
      timeBudgetMs: 100,
      abortInFlight,
      route: () => leasedRoute().route,
      dispatch,
    });

    await advanceAndSettle(runFallbackLoop(h), 150);

    expect(abortInFlight).toHaveBeenCalledTimes(1);
    expect(h.onExhausted).toHaveBeenCalledTimes(1);
    expect(h.onExhausted.mock.calls[0][1].timedOut).toBe(true);
  });
});
