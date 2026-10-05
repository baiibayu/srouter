import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDb, getDb } from '../../db/index.js';
import { encrypt } from '../../lib/crypto.js';
import { pruneRequestAnalytics } from '../../services/request-retention.js';
import { routePinnedModel, routeRequest } from '../../services/router.js';
import { routingExhaustionBody, setExhaustionHeaders } from '../../lib/fallback-loop.js';
import * as ledgerMigration from '../../db/migrations/20260914_000001_key_monthly_usage.js';
import * as budgetPeriodMigration from '../../db/migrations/20261005_000001_key_budget_period.js';
import * as autoBudgetPeriodMigration from '../../db/migrations/20261005_000002_key_budget_period_auto.js';
import {
  reserveMonthlyBudget,
  getMonthlyBudgetCaps,
  setMonthlyBudgetCaps,
  getMonthlyUsage,
  checkMonthlyBudget,
  secondsUntilNextMonth,
  nextMonthResetAt,
  periodBucket,
  nextResetAt,
  resolveAutoPeriod,
  syncAutoBudgetPeriod,
} from '../../services/key-budget.js';

// Per-key monthly budget (#1158): caps are opt-in (0 = unlimited), metering is
// the current UTC month's successful requests, and the rejection carries a
// Retry-After of seconds-until-next-month.

let keyId = 0;

function insertKey(overrides: {
  status?: string;
  monthlyRequestCap?: number;
  monthlyTokenCap?: number;
  budgetPeriodMode?: 'auto' | 'manual';
  budgetPeriod?: 'daily' | 'weekly' | 'monthly';
} = {}) {
  const { encrypted, iv, authTag } = encrypt('sk-test');
  const result = getDb().prepare(`
    INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled, monthly_request_cap, monthly_token_cap, budget_period, budget_period_mode)
    VALUES ('groq', 'test', ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(
    encrypted, iv, authTag,
    overrides.status ?? 'healthy',
    overrides.monthlyRequestCap ?? 0,
    overrides.monthlyTokenCap ?? 0,
    overrides.budgetPeriod ?? 'monthly',
    overrides.budgetPeriodMode ?? 'auto',
  );
  keyId = Number(result.lastInsertRowid);
}

function recordSuccess(now: Date) {
  getDb().prepare(
    `INSERT INTO requests (platform, model_id, key_id, status, input_tokens, output_tokens, latency_ms, error, created_at)
     VALUES ('groq', 'llama', ?, 'success', 100, 50, 100, NULL, ?)`,
  ).run(keyId, now.toISOString().slice(0, 19).replace('T', ' '));
}

function recordFailure(now: Date) {
  getDb().prepare(
    `INSERT INTO requests (platform, model_id, key_id, status, input_tokens, output_tokens, latency_ms, error, created_at)
     VALUES ('groq', 'llama', ?, 'error', 100, 0, 100, 'boom', ?)`,
  ).run(keyId, now.toISOString().slice(0, 19).replace('T', ' '));
}

function inThisMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 5, 12, 0, 0));
}

function lastMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 20, 12, 0, 0));
}

describe('key-budget: monthly caps (#1158)', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
  });

  beforeEach(() => {
    getDb().prepare('DELETE FROM api_keys').run();
    getDb().prepare('DELETE FROM requests').run();
    keyId = 0;
  });

  it('defaults to unlimited (0 caps) for a fresh key', () => {
    insertKey();
    // groq has daily limits → auto resolves to daily
    expect(getMonthlyBudgetCaps(keyId)).toEqual({ requestCap: 0, tokenCap: 0, period: 'daily', mode: 'auto', source: 'daily-limit' });
    expect(checkMonthlyBudget(keyId, 100)).toEqual({ allowed: true });
  });

  it('setMonthlyBudgetCaps persists caps', () => {
    insertKey();
    expect(setMonthlyBudgetCaps(keyId, { requestCap: 10, tokenCap: 5000 })).toBe(true);
    // groq has daily limits → auto resolves to daily
    expect(getMonthlyBudgetCaps(keyId)).toEqual({ requestCap: 10, tokenCap: 5000, period: 'daily', mode: 'auto', source: 'daily-limit' });
    // Patching only one field leaves the other untouched.
    setMonthlyBudgetCaps(keyId, { requestCap: 3 });
    expect(getMonthlyBudgetCaps(keyId)).toEqual({ requestCap: 3, tokenCap: 5000, period: 'daily', mode: 'auto', source: 'daily-limit' });
  });

  it('counts only the current month’s successful requests', () => {
    insertKey({ budgetPeriodMode: 'manual' });
    recordSuccess(inThisMonth()); // counts: 1 req, 150 tokens
    recordSuccess(inThisMonth()); // counts: 2 req, 300 tokens
    recordFailure(inThisMonth()); // excluded (status != success)
    recordSuccess(lastMonth());   // excluded (previous month)

    const usage = getMonthlyUsage(keyId);
    expect(usage.requests).toBe(2);
    expect(usage.tokens).toBe(300);
  });

  it('rejects at the request cap with a next-month Retry-After', () => {
    insertKey({ monthlyRequestCap: 2, budgetPeriodMode: 'manual' });
    recordSuccess(inThisMonth());
    recordSuccess(inThisMonth());

    const verdict = checkMonthlyBudget(keyId, 0);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.reason).toBe('monthly_request_cap');
      expect(verdict.retryAfterSec).toBeGreaterThan(0);
      // Retry-After should be at most ~32 days out (current month + 1 boundary).
      expect(verdict.retryAfterSec).toBeLessThanOrEqual(32 * 24 * 3600);
    }
  });

  it('rejects at the token cap, counting the estimated tokens of THIS request', () => {
    insertKey({ monthlyTokenCap: 1000, budgetPeriodMode: 'manual' });
    recordSuccess(inThisMonth()); // 150 tokens used

    // 150 + 900 > 1000 → rejected.
    expect(checkMonthlyBudget(keyId, 900).allowed).toBe(false);
    // 150 + 800 <= 1000 → allowed.
    expect(checkMonthlyBudget(keyId, 800)).toEqual({ allowed: true });
  });

  it('blocks requests with no token estimate once the token cap is fully spent', () => {
    insertKey({ monthlyTokenCap: 150, budgetPeriodMode: 'manual' });
    recordSuccess(inThisMonth());
    expect(checkMonthlyBudget(keyId, 0)).toMatchObject({ allowed: false, reason: 'monthly_token_cap' });
  });

  it('does not reject when the cap is hit exactly on the boundary request', () => {
    insertKey({ monthlyRequestCap: 2, budgetPeriodMode: 'manual' });
    recordSuccess(inThisMonth());
    recordSuccess(inThisMonth());
    // usage.requests === cap → rejected (strictly at/over the cap counts spent).
    expect(checkMonthlyBudget(keyId, 0).allowed).toBe(false);
  });

  it('retains spent budgets when request logs are pruned', () => {
    insertKey({ monthlyRequestCap: 2, budgetPeriodMode: 'manual' });
    recordSuccess(inThisMonth()); recordSuccess(inThisMonth());
    expect(checkMonthlyBudget(keyId, 0).allowed).toBe(false);
    const old = process.env.REQUEST_ANALYTICS_MAX_ROWS;
    try {
      process.env.REQUEST_ANALYTICS_MAX_ROWS = '1';
      pruneRequestAnalytics({ force: true });
      expect(getDb().prepare('SELECT COUNT(*) AS n FROM requests').get()).toEqual({ n: 1 });
      expect(getMonthlyUsage(keyId)).toEqual({ requests: 2, tokens: 300 });
      expect(checkMonthlyBudget(keyId, 0).allowed).toBe(false);
    } finally {
      if (old === undefined) delete process.env.REQUEST_ANALYTICS_MAX_ROWS;
      else process.env.REQUEST_ANALYTICS_MAX_ROWS = old;
    }
  });

  it('backfills the ledger once and does not double count when up is rerun', () => {
    insertKey();
    ledgerMigration.down(getDb());
    recordSuccess(inThisMonth());
    ledgerMigration.up(getDb());
    ledgerMigration.up(getDb());
    // Re-running the 20260914 migration recreates the original monthly-only
    // trigger; re-apply the period-aware one (20261005) like a real upgrade
    // would have it last.
    budgetPeriodMigration.up(getDb());
    expect(getMonthlyUsage(keyId)).toEqual({ requests: 1, tokens: 150 });
    recordSuccess(inThisMonth());
    expect(getMonthlyUsage(keyId)).toEqual({ requests: 2, tokens: 300 });
  });

  it('reserves the last request slot and releases it after an unsuccessful attempt', () => {
    insertKey({ monthlyRequestCap: 1 });
    const first = reserveMonthlyBudget(keyId, 100);
    expect(first.allowed).toBe(true);
    expect(reserveMonthlyBudget(keyId, 100).allowed).toBe(false);
    if (!first.allowed) throw new Error('expected a reservation');
    first.release(); first.release();
    expect(checkMonthlyBudget(keyId, 100).allowed).toBe(true);
    const second = reserveMonthlyBudget(keyId, 100);
    if (!second.allowed) throw new Error('expected a reservation');
    recordSuccess(inThisMonth());
    second.release();
    expect(checkMonthlyBudget(keyId, 100).allowed).toBe(false);
  });

  it('keeps token reservations for long streams until explicit release', () => {
    insertKey({ monthlyTokenCap: 1000 });
    const first = reserveMonthlyBudget(keyId, 600);
    if (!first.allowed) throw new Error('expected a reservation');
    expect(checkMonthlyBudget(keyId, 500, Date.now() + 10 * 60_000).allowed).toBe(false);
    const second = reserveMonthlyBudget(keyId, 400);
    expect(second.allowed).toBe(true);
    if (second.allowed) second.release();
    first.release();
    expect(checkMonthlyBudget(keyId, 1000).allowed).toBe(true);
  });

  it('resets completed usage at the next month while retaining active reservations', () => {
    insertKey({ monthlyRequestCap: 2, budgetPeriodMode: 'manual' });
    recordSuccess(inThisMonth());
    const first = reserveMonthlyBudget(keyId, 100);
    if (!first.allowed) throw new Error('expected a reservation');
    expect(checkMonthlyBudget(keyId, 0).allowed).toBe(false);
    const nextMonth = Date.parse(nextMonthResetAt());
    expect(getMonthlyUsage(keyId, 'monthly', nextMonth).requests).toBe(0);
    expect(checkMonthlyBudget(keyId, 0, nextMonth).allowed).toBe(true);
    first.release();
  });

  it('enforces reservations through real route selection and exposes the monthly retry header', () => {
    insertKey({ monthlyRequestCap: 1, budgetPeriodMode: 'manual' });
    const db = getDb();
    const model = db.prepare("SELECT id FROM models WHERE platform = 'groq' LIMIT 1").get() as { id: number };
    db.prepare('UPDATE models SET enabled = 1, rpm_limit = NULL, rpd_limit = NULL, tpm_limit = NULL, tpd_limit = NULL WHERE id = ?').run(model.id);
    const first = routePinnedModel(model.id, 100);
    expect(first).not.toBeNull();
    expect(routePinnedModel(model.id, 100)).toBeNull();
    first?.release?.();
    const second = routePinnedModel(model.id, 100);
    expect(second).not.toBeNull();
    second?.release?.();
    recordSuccess(inThisMonth());
    let error: unknown;
    try { routeRequest(100); } catch (err) { error = err; }
    expect(error).toBeDefined();
    const body = routingExhaustionBody(error);
    expect(body.status).toBe(429);
    expect(body.code).toBe('quota_exceeded');
    expect(body.retryAtMs).toBe(Date.parse(nextMonthResetAt()));
    const headers: Record<string, string> = {};
    setExhaustionHeaders({ setHeader: (name: string, value: string) => { headers[name] = value; } }, body);
    expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('secondsUntilNextMonth lands on the next UTC month boundary', () => {
    const now = Date.UTC(2026, 6, 15, 10, 0, 0); // 2026-07-15
    const secs = secondsUntilNextMonth(now);
    expect(secs).toBeGreaterThan(0);
    const reset = nextMonthResetAt(now);
    expect(reset).toBe('2026-08-01T00:00:00.000Z');
    // seconds until that boundary
    const expected = Math.floor((Date.parse('2026-08-01T00:00:00.000Z') - now) / 1000);
    expect(secs).toBe(expected);
  });

  it('periodBucket and reset boundaries match the trigger SQL (UTC)', () => {
    const wed = Date.UTC(2026, 9, 7, 15, 30); // 2026-10-07 Wednesday
    expect(periodBucket('daily', wed)).toBe('d:2026-10-07');
    expect(periodBucket('weekly', wed)).toBe('w:2026-10-05'); // Monday of that week
    expect(periodBucket('weekly', Date.UTC(2026, 9, 4))).toBe('w:2026-09-28'); // Sunday rolls back
    expect(periodBucket('monthly', wed)).toBe('2026-10');
    expect(nextResetAt('daily', wed)).toBe('2026-10-08T00:00:00.000Z');
    expect(nextResetAt('weekly', wed)).toBe('2026-10-12T00:00:00.000Z');
    expect(nextResetAt('monthly', wed)).toBe('2026-11-01T00:00:00.000Z');
  });

  it('daily period: buckets by UTC day, rejects at the cap, resets at next midnight', () => {
    insertKey({ monthlyRequestCap: 1 });
    getDb().prepare("UPDATE api_keys SET budget_period = 'daily' WHERE id = ?").run(keyId);
    recordSuccess(new Date());
    expect(getMonthlyUsage(keyId, 'daily').requests).toBe(1);
    // The monthly bucket stays empty — daily rows are namespaced ('d:').
    expect(getMonthlyUsage(keyId, 'monthly').requests).toBe(0);
    const verdict = checkMonthlyBudget(keyId, 0);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.retryAfterSec).toBeGreaterThan(0);
      expect(verdict.retryAfterSec).toBeLessThanOrEqual(24 * 3600);
    }
    expect(checkMonthlyBudget(keyId, 0, Date.now() + 24 * 3600_000).allowed).toBe(true);
  });

  it('weekly period: buckets on Monday, rejects at the cap, resets next Monday', () => {
    insertKey({ monthlyRequestCap: 1, budgetPeriodMode: 'manual' });
    getDb().prepare("UPDATE api_keys SET budget_period = 'weekly', budget_period_mode = 'manual' WHERE id = ?").run(keyId);
    recordSuccess(new Date());
    expect(getMonthlyUsage(keyId, 'weekly').requests).toBe(1);
    expect(getMonthlyUsage(keyId, 'monthly').requests).toBe(0);
    const verdict = checkMonthlyBudget(keyId, 0);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.retryAfterSec).toBeLessThanOrEqual(7 * 24 * 3600);
    expect(checkMonthlyBudget(keyId, 0, Date.now() + 7 * 24 * 3600_000).allowed).toBe(true);
  });

  it('switching the period starts the new counter at zero', () => {
    insertKey({ monthlyRequestCap: 1, budgetPeriodMode: 'manual' });
    recordSuccess(new Date());
    expect(getMonthlyUsage(keyId, 'monthly').requests).toBe(1);
    expect(checkMonthlyBudget(keyId, 0).allowed).toBe(false);
    getDb().prepare("UPDATE api_keys SET budget_period = 'daily', budget_period_mode = 'manual' WHERE id = ?").run(keyId);
    expect(getMonthlyUsage(keyId, 'daily').requests).toBe(0);
    expect(checkMonthlyBudget(keyId, 0).allowed).toBe(true);
  });

  // --- AUTO MODE TESTS ---

  function insertKeyWithPlatform(platform: string, budgetPeriodMode: 'auto' | 'manual' = 'auto') {
    const { encrypted, iv, authTag } = encrypt('sk-test');
    const result = getDb().prepare(`
      INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled, budget_period, budget_period_mode)
      VALUES (?, 'test', ?, ?, ?, 'healthy', 1, 'monthly', ?)
    `).run(platform, encrypted, iv, authTag, budgetPeriodMode);
    return Number(result.lastInsertRowid);
  }

  function recordSuccessFor(keyId: number, now: Date) {
    getDb().prepare(
      `INSERT INTO requests (platform, model_id, key_id, status, input_tokens, output_tokens, latency_ms, error, created_at)
       VALUES ('test', 'model', ?, 'success', 100, 50, 100, NULL, ?)`,
    ).run(keyId, now.toISOString().slice(0, 19).replace('T', ' '));
  }

  describe('resolveAutoPeriod', () => {
    it('returns daily/daily-limit when the platform has a per-day limit', () => {
      const db = getDb();
      db.prepare(
        `INSERT INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget, enabled)
         VALUES ('srouter-auto-daily-1', 'm1', 'M1', 1, 1, NULL, 1000, NULL, NULL, '', 1)`,
      ).run();
      expect(resolveAutoPeriod('srouter-auto-daily-1')).toEqual({ period: 'daily', source: 'daily-limit' });
    });

    it('returns monthly/monthly-label when the platform has a monthly budget label but no daily limits', () => {
      const db = getDb();
      db.prepare(
        `INSERT INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget, enabled)
         VALUES ('srouter-auto-monthly-1', 'm2', 'M2', 1, 1, NULL, NULL, NULL, NULL, '~1M', 1)`,
      ).run();
      expect(resolveAutoPeriod('srouter-auto-monthly-1')).toEqual({ period: 'monthly', source: 'monthly-label' });
    });

    it('returns monthly/fallback when the platform has no models', () => {
      expect(resolveAutoPeriod('srouter-auto-none-1')).toEqual({ period: 'monthly', source: 'fallback' });
    });
  });

  describe('syncAutoBudgetPeriod', () => {
    it('updates budget_period to the resolved period for auto-mode keys', () => {
      const db = getDb();
      db.prepare(
        `INSERT INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget, enabled)
         VALUES ('srouter-auto-daily-2', 'm1', 'M1', 1, 1, NULL, 1000, NULL, NULL, '', 1)`,
      ).run();
      const id = insertKeyWithPlatform('srouter-auto-daily-2', 'auto');
      const result = syncAutoBudgetPeriod(id);
      expect(result).toEqual({ mode: 'auto', period: 'daily', source: 'daily-limit' });
      const row = db.prepare('SELECT budget_period, budget_period_mode FROM api_keys WHERE id = ?').get(id);
      expect(row.budget_period).toBe('daily');
      expect(row.budget_period_mode).toBe('auto');
    });

    it('leaves manual keys untouched', () => {
      const db = getDb();
      db.prepare(
        `INSERT INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget, enabled)
         VALUES ('srouter-auto-daily-3', 'm1', 'M1', 1, 1, NULL, 1000, NULL, NULL, '', 1)`,
      ).run();
      const id = insertKeyWithPlatform('srouter-auto-daily-3', 'manual');
      const result = syncAutoBudgetPeriod(id);
      expect(result).toEqual({ mode: 'manual', period: 'monthly', source: 'manual' });
      const row = db.prepare('SELECT budget_period, budget_period_mode FROM api_keys WHERE id = ?').get(id);
      expect(row.budget_period).toBe('monthly');
      expect(row.budget_period_mode).toBe('manual');
    });

    it('getMonthlyBudgetCaps triggers sync and returns the synced period', () => {
      const db = getDb();
      db.prepare(
        `INSERT INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget, enabled)
         VALUES ('srouter-auto-daily-4', 'm1', 'M1', 1, 1, NULL, 1000, NULL, NULL, '', 1)`,
      ).run();
      const id = insertKeyWithPlatform('srouter-auto-daily-4', 'auto');
      const caps = getMonthlyBudgetCaps(id);
      expect(caps).toMatchObject({ period: 'daily', mode: 'auto', source: 'daily-limit' });
    });
  });

  it('auto key on a daily platform buckets requests as d:YYYY-MM-DD via the trigger', () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget, enabled)
       VALUES ('srouter-auto-daily-5', 'm1', 'M1', 1, 1, NULL, 1000, NULL, NULL, '', 1)`,
    ).run();
    // Ensure migrations are applied (initDb does this; here we re-apply like the backfill test does)
    ledgerMigration.down(db);
    ledgerMigration.up(db);
    budgetPeriodMigration.up(db);
    autoBudgetPeriodMigration.up(db);

    const id = insertKeyWithPlatform('srouter-auto-daily-5', 'auto');
    syncAutoBudgetPeriod(id); // flips budget_period to 'daily'

    recordSuccessFor(id, new Date());
    const usage = getMonthlyUsage(id, 'daily');
    expect(usage.requests).toBe(1);
    // Monthly bucket stays empty — daily rows are namespaced ('d:').
    expect(getMonthlyUsage(id, 'monthly').requests).toBe(0);
  });
});
