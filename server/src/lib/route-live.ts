// Live view of the router's current and most recent decisions, for the
// dashboard's routing strip. Fed from traceRouteEvent — the single choke point
// every start/next/ok/fail already passes through — so no hook touches the
// request path itself.
//
// Deliberately volatile: the state lives in memory, a restart starts the strip
// empty, and that is honest (the strip says "waiting for a request" instead of
// inventing history). A client that hangs up mid-stream is a first-class
// terminal ('canceled', emitted at every disconnect stop in the fallback loop
// and the stream surfaces) so it leaves the active view immediately instead of
// faking "processing". The age and size caps below are only the backstop for
// paths that still slip through: past MAX_AGE_MS the entry is dropped, and its
// eventual ok/fail/canceled (if it ever arrives) still lands as `last`.

export type RouteTraceEvent = 'start' | 'next' | 'ok' | 'fail' | 'canceled';

interface Entry {
  requestId: string;
  platform: string;
  model: string;
  attempt: number;
  requestedModel?: string;
  clientAgent?: string;
  startedAt: number;
}

export interface LiveActiveRoute {
  platform: string;
  model: string;
  attempt: number;
  requestedModel: string | null;
  clientAgent: string | null;
  ageMs: number;
}

export interface LiveLastRoute extends LiveActiveRoute {
  outcome: 'ok' | 'fail' | 'canceled';
  latencyMs: number;
}

export interface LiveRoutesResponse {
  active: LiveActiveRoute[];
  last: LiveLastRoute | null;
  recent?: LiveLastRoute[];
}

/** An entry older than this never reported an outcome: drop it from view. */
const MAX_AGE_MS = 10 * 60_000;
/** In-flight entries tracked before the oldest is evicted. */
const MAX_ACTIVE = 32;
/** Retain recent completions for up to 20s so operators can see successful routes. */
const MAX_RECENT_AGE_MS = 20_000;
const MAX_RECENT = 8;

type CompletedEntry = Entry & {
  outcome: 'ok' | 'fail' | 'canceled';
  finishedAt: number;
  latencyMs: number;
};

const active = new Map<string, Entry>();
let last: CompletedEntry | null = null;
const recentCompleted: CompletedEntry[] = [];

/**
 * Composite key for the active map. Codex (and other Responses clients) send
 * several tool-bearing requests in parallel under a single x-request-id, so
 * keying only on requestId collapses them into one lane. Adding platform,
 * model and attempt keeps each attempt visible as its own lane.
 */
function activeKey(opts: {
  requestId: string;
  platform: string;
  model: string;
  attempt: number;
}): string {
  return `${opts.requestId}::${opts.platform}::${opts.model}::a${opts.attempt}`;
}

export function recordRouteTrace(opts: {
  event: RouteTraceEvent;
  requestId: string;
  attempt: number;
  platform: string;
  model: string;
  requestedModel?: string;
  clientAgent?: string;
  latencyMs?: number;
}): void {
  const now = Date.now();
  const key = activeKey(opts);

  if (opts.event === 'start') {
    // A fresh in-flight attempt. Drop any prior entry with the same composite
    // key so a re-attempt of the exact same platform+model+attempt shows the
    // freshest one, not a stale duplicate.
    active.delete(key);
    const entry: Entry = {
      requestId: opts.requestId,
      startedAt: now,
      platform: opts.platform,
      model: opts.model,
      attempt: opts.attempt,
      clientAgent: opts.clientAgent,
    };
    if (opts.requestedModel) entry.requestedModel = opts.requestedModel;
    active.set(key, entry);
    trim(now);
    return;
  }

  if (opts.event === 'next') {
    // Failover: the same request moved to a different platform/model/attempt.
    // Drop every entry sharing this requestId so the strip shows only the
    // current attempt — otherwise a superseded attempt and the new one would
    // both stay "active" until the old one aged out.
    for (const k of [...active.keys()]) {
      const e = active.get(k);
      if (e && e.requestId === opts.requestId) active.delete(k);
    }
    const entry: Entry = {
      requestId: opts.requestId,
      startedAt: now,
      platform: opts.platform,
      model: opts.model,
      attempt: opts.attempt,
      clientAgent: opts.clientAgent,
    };
    if (opts.requestedModel) entry.requestedModel = opts.requestedModel;
    active.set(key, entry);
    trim(now);
    return;
  }

  // ok | fail | canceled — terminal. Runs even when the entry was already
  // trimmed, so a long stream still reports its outcome the moment it ends.
  let existing = active.get(key);
  if (existing) {
    active.delete(key);
  } else {
    for (const [k, e] of active.entries()) {
      if (e.requestId === opts.requestId) {
        existing = e;
        active.delete(k);
        break;
      }
    }
  }
  const startedAt = existing?.startedAt ?? now - (opts.latencyMs ?? 0);
  last = {
    requestId: opts.requestId,
    platform: opts.platform,
    model: opts.model,
    attempt: opts.attempt,
    requestedModel: opts.requestedModel ?? existing?.requestedModel,
    clientAgent: opts.clientAgent ?? existing?.clientAgent,
    startedAt,
    outcome: opts.event,
    finishedAt: now,
    latencyMs: opts.latencyMs ?? now - startedAt,
  };
  recentCompleted.unshift(last);
  if (recentCompleted.length > MAX_RECENT) recentCompleted.length = MAX_RECENT;
}

function trim(now: number): void {
  for (const [id, entry] of active) {
    if (now - entry.startedAt > MAX_AGE_MS) active.delete(id);
  }
  while (active.size > MAX_ACTIVE) {
    const oldest = active.keys().next().value;
    if (oldest === undefined) break;
    active.delete(oldest);
  }
  for (let i = recentCompleted.length - 1; i >= 0; i--) {
    if (now - recentCompleted[i]!.finishedAt > MAX_RECENT_AGE_MS) {
      recentCompleted.splice(i, 1);
    }
  }
}

export function getLiveRoutes(): LiveRoutesResponse {
  const now = Date.now();
  trim(now);
  return {
    active: [...active.values()].map(entry => ({
      platform: entry.platform,
      model: entry.model,
      attempt: entry.attempt,
      requestedModel: entry.requestedModel ?? null,
      clientAgent: entry.clientAgent ?? null,
      ageMs: now - entry.startedAt,
    })),
    last: last
      ? {
          platform: last.platform,
          model: last.model,
          attempt: last.attempt,
          requestedModel: last.requestedModel ?? null,
          clientAgent: last.clientAgent ?? null,
          ageMs: now - last.finishedAt,
          outcome: last.outcome,
          latencyMs: last.latencyMs,
        }
      : null,
    recent: recentCompleted.map(item => ({
      platform: item.platform,
      model: item.model,
      attempt: item.attempt,
      requestedModel: item.requestedModel ?? null,
      clientAgent: item.clientAgent ?? null,
      ageMs: now - item.finishedAt,
      outcome: item.outcome,
      latencyMs: item.latencyMs,
    })),
  };
}

/** Test hook — the strip is stateful and suites must not leak into each other. */
export function resetRouteLiveForTest(): void {
  active.clear();
  last = null;
  recentCompleted.length = 0;
}
