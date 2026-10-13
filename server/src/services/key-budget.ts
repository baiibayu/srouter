/**
 * Per-key budget (#1158, period-aware): optional request/token caps per
 * api_keys row, enforced against the CURRENT UTC period's successful
 * requests. The period is chosen per key to match the provider's reset
 * cycle: daily (next 00:00 UTC), weekly (next Monday 00:00 UTC) or monthly
 * (1st 00:00 UTC, the original behaviour and the default).
 *
 * A key at its cap returns `quota_exceeded` (429) with a Retry-After of
 * "seconds until the next period boundary" — the semantic GateLLM-style
 * rejection so an agent knows when the window resets instead of hammering
 * a 429.
 *
 * Successful usage is retained in key_monthly_usage independently of
 * analytics retention. Buckets are namespaced per period ('d:YYYY-MM-DD',
 * 'w:YYYY-MM-DD' Monday, bare 'YYYY-MM' month) so switching a key's period
 * starts the new counter at zero instead of reinterpreting old rows — see
 * migration 20261005_000001_key_budget_period, whose trigger mirrors
 * periodBucket() exactly. Active requests reserve their estimated tokens
 * until their route is released. Actual provider usage is settled by the
 * request-log transaction; token estimates are an admission guard, not an
 * exact upstream billing cap. Caps are opt-in (0 = unlimited).
 *
 * AUTO MODE: a key may leave its period to the provider's catalog
 * declaration (`budget_period_mode = 'auto'`). resolveAutoPeriod() reads the
 * `models` table for that platform — a per-day limit field (tpd_limit or
 * rpd_limit) means the provider resets daily, a non-empty
 * monthly_token_budget means a monthly allowance, otherwise the unknown
 * fallback is monthly. The resolved CONCRETE period is written into
 * `budget_period` (the trigger reads that column and must stay concrete —
 * 'auto' is never stored there); `budget_period_mode` stays 'auto' so the
 * UI can tell a resolved key from a manually-picked one. Weekly is never
 * produced by auto resolution: the catalog carries no weekly field, so
 * weekly remains a manual choice only.
 */
import { getDb } from '../db/index.js';
import type {
  BudgetPeriod,
  ConcreteBudgetPeriod,
  BudgetPeriodSource,
} from '@srouter/shared/types.js';

/** Re-exported so consumers can import the shared types from here. */
export type { BudgetPeriod, ConcreteBudgetPeriod, BudgetPeriodSource };

export const BUDGET_PERIODS: readonly ConcreteBudgetPeriod[] = ['daily', 'weekly', 'monthly'];

export function asBudgetPeriod(raw: unknown): BudgetPeriod {
  return raw === 'daily' || raw === 'weekly' || raw === 'monthly' ? raw : 'monthly';
}

/** Cast a stored/external value to a concrete period (auto is never stored). */
export function asConcreteBudgetPeriod(raw: unknown): ConcreteBudgetPeriod {
  return raw === 'daily' || raw === 'weekly' ? raw : 'monthly';
}

/** Resolve the auto budget period for a platform from the catalog. */
export function resolveAutoPeriod(platform: string): {
  period: ConcreteBudgetPeriod;
  source: BudgetPeriodSource;
} {
  const db = getDb();
  const row = db.prepare(
    `SELECT
      EXISTS(SELECT 1 FROM models WHERE platform = ? AND (tpd_limit IS NOT NULL OR rpd_limit IS NOT NULL)) AS has_daily,
      EXISTS(SELECT 1 FROM models WHERE platform = ? AND monthly_token_budget <> '') AS has_monthly`,
  ).get(platform, platform) as { has_daily: number; has_monthly: number };
  if (row.has_daily) return { period: 'daily', source: 'daily-limit' };
  if (row.has_monthly) return { period: 'monthly', source: 'monthly-label' };
  return { period: 'monthly', source: 'fallback' };
}

/** Synchronize an auto-mode key's concrete period with the catalog. */
export function syncAutoBudgetPeriod(keyId: number): {
  mode: 'auto' | 'manual';
  period: ConcreteBudgetPeriod;
  source: BudgetPeriodSource;
} {
  const row = getDb().prepare(
    'SELECT platform, budget_period, budget_period_mode FROM api_keys WHERE id = ?',
  ).get(keyId) as { platform: string; budget_period: string; budget_period_mode: string } | undefined;
  if (!row) return { mode: 'manual', period: 'monthly', source: 'manual' };
  if (row.budget_period_mode === 'manual') {
    return { mode: 'manual', period: asConcreteBudgetPeriod(row.budget_period), source: 'manual' };
  }
  const resolved = resolveAutoPeriod(row.platform);
  if (resolved.period !== row.budget_period) {
    getDb().prepare('UPDATE api_keys SET budget_period = ? WHERE id = ?').run(resolved.period, keyId);
  }
  return { mode: 'auto', period: resolved.period, source: resolved.source };
}

export interface MonthlyBudgetCaps {
  /** 0 = unlimited (the default, unchanged behaviour). */
  requestCap: number;
  /** 0 = unlimited. */
  tokenCap: number;
  /** UTC window the caps are counted against. */
  period: ConcreteBudgetPeriod;
  /** Whether the period is auto-resolved or manually chosen. */
  mode: 'auto' | 'manual';
  /** For 'auto': why the period was chosen. */
  source: BudgetPeriodSource;
}

export interface MonthlyUsage {
  /** Successful requests in the current period. */
  requests: number;
  /** Sum of (input_tokens + output_tokens) over those successes. */
  tokens: number;
}

export type BudgetVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'monthly_request_cap' | 'monthly_token_cap'; retryAfterSec: number };

/** Ledger bucket for a period at `now` — must match the trigger's SQL. */
export function periodBucket(period: ConcreteBudgetPeriod, now = Date.now()): string {
  const d = new Date(now);
  if (period === 'monthly') return d.toISOString().slice(0, 7);
  const day = d.toISOString().slice(0, 10);
  if (period === 'daily') return `d:${day}`;
  const mondayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return `w:${new Date(mondayMs).toISOString().slice(0, 10)}`;
}

function utcNextPeriodStartMs(period: ConcreteBudgetPeriod, now: number): number {
  const d = new Date(now);
  if (period === 'monthly') {
    const month = d.getUTCMonth() + 1;
    return Date.UTC(d.getUTCFullYear() + Math.floor(month / 12), month % 12, 1);
  }
  if (period === 'daily') {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  }
  // weekly: Monday of this UTC week + 7 days
  const mondayDate = d.getUTCDate() - ((d.getUTCDay() + 6) % 7);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), mondayDate + 7);
}

interface Reservation { keyId: number; tokens: number }
// These requests belong to this process and remain reserved until completion,
// even if a stream outlives the short rate-limit lease timeout. A restarted
// process has no active requests; completed usage remains in SQLite.
const reservations = new WeakMap<ReturnType<typeof getDb>, Set<Reservation>>();

function activeReservations(): Set<Reservation> {
  const db = getDb();
  let active = reservations.get(db);
  if (!active) { active = new Set(); reservations.set(db, active); }
  return active;
}

export function getMonthlyBudgetCaps(keyId: number): MonthlyBudgetCaps {
  const sync = syncAutoBudgetPeriod(keyId);
  const row = getDb().prepare(
    'SELECT monthly_request_cap, monthly_token_cap FROM api_keys WHERE id = ?',
  ).get(keyId) as { monthly_request_cap: number; monthly_token_cap: number } | undefined;
  if (!row) return { requestCap: 0, tokenCap: 0, period: 'monthly', mode: 'manual', source: 'manual' };
  return { requestCap: row.monthly_request_cap, tokenCap: row.monthly_token_cap, period: sync.period, mode: sync.mode, source: sync.source };
}

export function setMonthlyBudgetCaps(
  keyId: number,
  patch: Partial<Pick<MonthlyBudgetCaps, 'requestCap' | 'tokenCap'>>,
): boolean {
  const sets: string[] = [];
  const values: number[] = [];
  if (patch.requestCap !== undefined) {
    sets.push('monthly_request_cap = ?');
    values.push(patch.requestCap);
  }
  if (patch.tokenCap !== undefined) {
    sets.push('monthly_token_cap = ?');
    values.push(patch.tokenCap);
  }
  if (sets.length === 0) return false;
  const result = getDb().prepare(`UPDATE api_keys SET ${sets.join(', ')} WHERE id = ?`).run(...values, keyId);
  return result.changes > 0;
}

export function getMonthlyUsage(keyId: number, period: ConcreteBudgetPeriod = 'monthly', now = Date.now()): MonthlyUsage {
  const row = getDb().prepare(
    `SELECT requests, tokens FROM key_monthly_usage WHERE key_id = ? AND month = ?`
  ).get(keyId, periodBucket(period, now)) as MonthlyUsage | undefined;
  return { requests: Number(row?.requests ?? 0), tokens: Number(row?.tokens ?? 0) };
}

/**
 * Check a key against its caps, taking the current period's successful usage
 * plus the tokens THIS request would add. Returns allowed when both caps are
 * 0 (unlimited) or neither would be exceeded.
 */
export function checkMonthlyBudget(
  keyId: number,
  estimatedTokens: number,
  now = Date.now(),
): BudgetVerdict {
  const caps = getMonthlyBudgetCaps(keyId);
  if (caps.requestCap <= 0 && caps.tokenCap <= 0) return { allowed: true };

  const usage = getMonthlyUsage(keyId, caps.period, now);
  for (const reservation of activeReservations()) {
    if (reservation.keyId !== keyId) continue;
    usage.requests++;
    usage.tokens += reservation.tokens;
  }
  if (caps.requestCap > 0 && usage.requests >= caps.requestCap) {
    return { allowed: false, reason: 'monthly_request_cap', retryAfterSec: secondsUntilNextPeriod(caps.period, now) };
  }
  if (caps.tokenCap > 0 && (usage.tokens >= caps.tokenCap || usage.tokens + Math.max(0, estimatedTokens) > caps.tokenCap)) {
    return { allowed: false, reason: 'monthly_token_cap', retryAfterSec: secondsUntilNextPeriod(caps.period, now) };
  }
  return { allowed: true };
}

/** Check and reserve synchronously before dispatch; release on every terminal path. */
export function reserveMonthlyBudget(
  keyId: number,
  estimatedTokens: number,
): { allowed: true; release: () => void } | Extract<BudgetVerdict, { allowed: false }> {
  const verdict = checkMonthlyBudget(keyId, estimatedTokens);
  if (!verdict.allowed) return verdict;
  const active = activeReservations();
  const reservation = { keyId, tokens: Math.max(0, estimatedTokens) };
  active.add(reservation);
  return { allowed: true, release: () => { active.delete(reservation); } };
}

/** Seconds from `now` until the next boundary of the period — the Retry-After value. */
export function secondsUntilNextPeriod(period: ConcreteBudgetPeriod, now = Date.now()): number {
  return Math.max(1, Math.floor((utcNextPeriodStartMs(period, now) - now) / 1000));
}

/** Seconds from `now` until the next UTC month boundary (monthly default). */
export function secondsUntilNextMonth(now = Date.now()): number {
  return secondsUntilNextPeriod('monthly', now);
}

/** ISO timestamp of the next period boundary (for headers / diagnostics). */
export function nextResetAt(period: ConcreteBudgetPeriod, now = Date.now()): string {
  return new Date(utcNextPeriodStartMs(period, now)).toISOString();
}

/** ISO timestamp of the next UTC month boundary (monthly default). */
export function nextMonthResetAt(now = Date.now()): string {
  return nextResetAt('monthly', now);
}

/** Soonest period boundary among the keys currently blocked by their caps —
 *  what the routing exhaustion body advertises as the retry time. Falls back
 *  to the next month when no capped key is blocked. */
export function soonestBudgetResetAt(now = Date.now()): string {
  const rows = getDb().prepare(
    'SELECT id FROM api_keys WHERE monthly_request_cap > 0 OR monthly_token_cap > 0',
  ).all() as { id: number }[];
  let soonestMs = utcNextPeriodStartMs('monthly', now);
  for (const row of rows) {
    const caps = getMonthlyBudgetCaps(row.id);
    if (checkMonthlyBudget(row.id, 0, now).allowed) continue;
    const atMs = utcNextPeriodStartMs(caps.period, now);
    if (atMs < soonestMs) soonestMs = atMs;
  }
  return new Date(soonestMs).toISOString();
}
