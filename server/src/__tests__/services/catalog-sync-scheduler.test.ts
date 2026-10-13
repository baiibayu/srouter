import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { initDb } from '../../db/index.js';
import { startCatalogSync, stopCatalogSync, syncCatalog, updateSyncSchedule } from '../../services/catalog-sync.js';
import type { Scheduler } from '../../lib/scheduler.js';

function makeScheduler() {
  const every: { ms: number; fn: () => void | Promise<void> }[] = [];
  const after: { ms: number; fn: () => void | Promise<void> }[] = [];
  const cancels: ReturnType<typeof vi.fn>[] = [];
  const scheduler: Scheduler = {
    every(ms, fn) {
      const cancel = vi.fn();
      every.push({ ms, fn });
      cancels.push(cancel);
      return cancel;
    },
    after(ms, fn) {
      const cancel = vi.fn();
      after.push({ ms, fn });
      cancels.push(cancel);
      return cancel;
    },
  };
  return { scheduler, every, after, cancels };
}

describe('startCatalogSync / stopCatalogSync', () => {
  beforeAll(() => {
    // These tests exercise the remote-catalog polling path (boot delay +
    // interval registration + fetch). Standalone bundled mode schedules no
    // remote poll, so CATALOG_BASE_URL must be set to reach this code.
    process.env.CATALOG_BASE_URL = 'https://catalog.test';
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
  });

  afterAll(() => {
    delete process.env.CATALOG_BASE_URL;
  });

  afterEach(() => {
    stopCatalogSync();
    delete process.env.CATALOG_SYNC_DISABLED;
  });

  it('registers a 10-second boot delay and a 12-hour interval', () => {
    const { scheduler, every, after } = makeScheduler();
    startCatalogSync(scheduler);
    expect(after).toHaveLength(1);
    expect(after[0].ms).toBe(10 * 1000);
    expect(every).toHaveLength(1);
    expect(every[0].ms).toBe(12 * 60 * 60 * 1000);
  });

  it('is idempotent — double-start registers only one set of jobs', () => {
    const { scheduler, every, after } = makeScheduler();
    startCatalogSync(scheduler);
    startCatalogSync(scheduler);
    expect(after).toHaveLength(1);
    expect(every).toHaveLength(1);
  });

  it('registers nothing when CATALOG_SYNC_DISABLED=1', () => {
    process.env.CATALOG_SYNC_DISABLED = '1';
    const { scheduler, every, after } = makeScheduler();
    startCatalogSync(scheduler);
    expect(after).toHaveLength(0);
    expect(every).toHaveLength(0);
  });

  it('kill switch never stores the scheduler — updateSyncSchedule stays inert', () => {
    // Regression: currentScheduler used to be assigned BEFORE the env check,
    // so a later updateSyncSchedule()/restartInterval() could resurrect the
    // polling timer even with CATALOG_SYNC_DISABLED=1.
    process.env.CATALOG_SYNC_DISABLED = '1';
    const { scheduler, every, after } = makeScheduler();
    startCatalogSync(scheduler);
    delete process.env.CATALOG_SYNC_DISABLED;
    updateSyncSchedule();
    expect(after).toHaveLength(0);
    expect(every).toHaveLength(0);
  });

  it('can start after the kill switch is lifted', () => {
    process.env.CATALOG_SYNC_DISABLED = '1';
    const { scheduler } = makeScheduler();
    startCatalogSync(scheduler);
    delete process.env.CATALOG_SYNC_DISABLED;

    const { scheduler: s2, every, after } = makeScheduler();
    startCatalogSync(s2);
    expect(after).toHaveLength(1);
    expect(every).toHaveLength(1);
  });

  it('stop invokes both cancel handles', () => {
    const { scheduler, cancels } = makeScheduler();
    startCatalogSync(scheduler);
    stopCatalogSync();
    expect(cancels).toHaveLength(2);
    cancels.forEach((c) => expect(c).toHaveBeenCalledOnce());
  });

  it('can re-register after stop', () => {
    const { scheduler: s1 } = makeScheduler();
    startCatalogSync(s1);
    stopCatalogSync();

    const { scheduler: s2, every, after } = makeScheduler();
    startCatalogSync(s2);
    expect(after).toHaveLength(1);
    expect(every).toHaveLength(1);
  });

  it('syncCatalog in-flight guard: concurrent calls share one run', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchGate = new Promise<Response>((res) => { resolveFetch = res; });
    let fetchCount = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetchCount++;
      return fetchGate;
    }));

    try {
      const p1 = syncCatalog();
      const p2 = syncCatalog();
      await Promise.resolve();
      resolveFetch(new Response(null, { status: 304 }));
      const [r1, r2] = await Promise.all([p1, p2]);

      expect(fetchCount).toBe(1);
      expect(r1).toBe(r2); // same run result handed to both callers
      expect(r1.ok).toBe(true);
      expect(r1.action).toBe('up_to_date');

      // Guard clears after the run settles: the next call fetches anew.
      await syncCatalog();
      expect(fetchCount).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// Auto-discover must follow the SAME sync_interval_hours semantics as catalog
// sync: unset -> getSyncIntervalHours() default (12h); explicit 0/'off' ->
// no recurring timer.
describe('auto-discover interval follows sync_interval_hours', () => {
  let autoDiscover: typeof import('../../services/auto-discover.js');
  let db: typeof import('../../db/index.js');

  beforeEach(async () => {
    vi.resetModules();
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    db = await import('../../db/index.js');
    db.initDb(':memory:');
    autoDiscover = await import('../../services/auto-discover.js');
  });

  afterEach(() => {
    delete process.env.MODEL_REFRESH_DISABLED;
  });

  function setSyncInterval(raw: string | undefined): void {
    if (raw === undefined) {
      db.getDb().prepare("DELETE FROM settings WHERE key = 'sync_interval_hours'").run();
    } else {
      db.setSetting('sync_interval_hours', raw);
    }
  }

  it('unset follows getSyncIntervalHours default (12h)', () => {
    setSyncInterval(undefined);
    const { scheduler, every } = makeScheduler();
    autoDiscover.startModelRefresh(scheduler);
    expect(every).toHaveLength(1);
    expect(every[0].ms).toBe(12 * 60 * 60 * 1000);
  });

  it("setting '0' disables the recurring timer", () => {
    setSyncInterval('0');
    const { scheduler, every } = makeScheduler();
    autoDiscover.startModelRefresh(scheduler);
    expect(every).toHaveLength(0);
  });

  it("setting 'off' disables the recurring timer", () => {
    setSyncInterval('off');
    const { scheduler, every } = makeScheduler();
    autoDiscover.startModelRefresh(scheduler);
    expect(every).toHaveLength(0);
  });

  it("setting '6' schedules a 6h timer", () => {
    setSyncInterval('6');
    const { scheduler, every } = makeScheduler();
    autoDiscover.startModelRefresh(scheduler);
    expect(every).toHaveLength(1);
    expect(every[0].ms).toBe(6 * 60 * 60 * 1000);
  });
});
