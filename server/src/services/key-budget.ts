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
 */
import { getDb } from '../db/index.js';

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly';
export const BUDGET_PERIODS: readonly BudgetPeriod[] = ['daily', 'weekly', 'monthly'];

export function asBudgetPeriod(raw: unknown): BudgetPeriod {
  return raw === 'daily' || raw === 'weekly' || raw === 'monthly' ? raw : 'monthly';
}

export interface MonthlyBudgetCaps {
  /** 0 = unlimited (the default, unchanged behaviour). */
  requestCap: number;
  /** 0 = unlimited. */
  tokenCap: number;
  /** UTC window the caps are counted against. */
  period: BudgetPeriod;
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
export function periodBucket(period: BudgetPeriod, now = Date.now()): string {
  const d = new Date(now);
  if (period === 'monthly') return d.toISOString().slice(0, 7);
  const day = d.toISOString().slice(0, 10);
  if (period === 'daily') return `d:${day}`;
  const mondayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return `w:${new Date(mondayMs).toISOString().slice(0, 10)}`;
}

function utcNextPeriodStartMs(period: BudgetPeriod, now: number): number {
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
  const row = getDb().prepare(
    'SELECT monthly_request_cap, monthly_token_cap, budget_period FROM api_keys WHERE id = ?',
  ).get(keyId) as { monthly_request_cap: number; monthly_token_cap: number; budget_period: string } | undefined;
  if (!row) return { requestCap: 0, tokenCap: 0, period: 'monthly' };
  return { requestCap: row.monthly_request_cap, tokenCap: row.monthly_token_cap, period: asBudgetPeriod(row.budget_period) };
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

export function getMonthlyUsage(keyId: number, period: BudgetPeriod = 'monthly', now = Date.now()): MonthlyUsage {
  const row = getDb().prepare(`
    SELECT requests, tokens FROM key_monthly_usage WHERE key_id = ? AND month = ?
  `).get(keyId, periodBucket(period, now)) as MonthlyUsage | undefined;
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
export function secondsUntilNextPeriod(period: BudgetPeriod, now = Date.now()): number {
  return Math.max(1, Math.floor((utcNextPeriodStartMs(period, now) - now) / 1000));
}

/** Seconds from `now` until the next UTC month boundary (monthly default). */
export function secondsUntilNextMonth(now = Date.now()): number {
  return secondsUntilNextPeriod('monthly', now);
}

/** ISO timestamp of the next period boundary (for headers / diagnostics). */
export function nextResetAt(period: BudgetPeriod, now = Date.now()): string {
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
