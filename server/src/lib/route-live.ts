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
  startedAt: number;
}

export interface LiveActiveRoute {
  platform: string;
  model: string;
  attempt: number;
  requestedModel: string | null;
  ageMs: number;
}

export interface LiveLastRoute extends LiveActiveRoute {
  outcome: 'ok' | 'fail' | 'canceled';
  latencyMs: number;
}

export interface LiveRoutesResponse {
  active: LiveActiveRoute[];
  last: LiveLastRoute | null;
}

/** An entry older than this never reported an outcome: drop it from view. */
const MAX_AGE_MS = 10 * 60_000;
/** In-flight entries tracked before the oldest is evicted. */
const MAX_ACTIVE = 32;

const active = new Map<string, Entry>();
let last:
  | (Entry & { outcome: 'ok' | 'fail' | 'canceled'; finishedAt: number; latencyMs: number })
  | null = null;

export function recordRouteTrace(opts: {
  event: RouteTraceEvent;
  requestId: string;
  attempt: number;
  platform: string;
  model: string;
  requestedModel?: string;
  latencyMs?: number;
}): void {
  const now = Date.now();

  if (opts.event === 'start' || opts.event === 'next') {
    const entry = active.get(opts.requestId) ?? {
      requestId: opts.requestId,
      startedAt: now,
      platform: opts.platform,
      model: opts.model,
      attempt: opts.attempt,
    };
    entry.platform = opts.platform;
    entry.model = opts.model;
    entry.attempt = opts.attempt;
    if (opts.requestedModel) entry.requestedModel = opts.requestedModel;
    active.set(opts.requestId, entry);
    trim(now);
    return;
  }

  // ok | fail | canceled — terminal. Runs even when the entry was already
  // trimmed, so a long stream still reports its outcome the moment it ends.
  const existing = active.get(opts.requestId);
  active.delete(opts.requestId);
  const startedAt = existing?.startedAt ?? now - (opts.latencyMs ?? 0);
  last = {
    requestId: opts.requestId,
    platform: opts.platform,
    model: opts.model,
    attempt: opts.attempt,
    requestedModel: opts.requestedModel ?? existing?.requestedModel,
    startedAt,
    outcome: opts.event,
    finishedAt: now,
    latencyMs: opts.latencyMs ?? now - startedAt,
  };
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
      ageMs: now - entry.startedAt,
    })),
    last: last
      ? {
          platform: last.platform,
          model: last.model,
          attempt: last.attempt,
          requestedModel: last.requestedModel ?? null,
          ageMs: now - last.finishedAt,
          outcome: last.outcome,
          latencyMs: last.latencyMs,
        }
      : null,
  };
}

/** Test hook — the strip is stateful and suites must not leak into each other. */
export function resetRouteLiveForTest(): void {
  active.clear();
  last = null;
}
