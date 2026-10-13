import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { initDb, setSetting, getSetting } from '../../db/index.js';
import {
  emitDegradedNotif,
  removeDegradedNotif,
  emitUpdateAvailableNotif,
  settleUpdateAvailableNotif,
  isNewerVersion,
  checkUpdateAvailable,
} from '../../services/notification-emitter.js';
import {
  getNotifications,
  unreadNotificationCount,
  markNotificationsRead,
  removeNotificationsByType,
} from '../../services/catalog-sync.js';

// Locks the notification emission contract: degraded + update rows carry the
// i18n payload the dashboard renders, the update check only fires on a real
// newer release from a repository that was explicitly configured, the pending
// update row is single + pinned + survives mark-all, and settle unpins it.

// The emitter's dedup map is module-level and keyed on Date.now. Advance the
// fake clock beyond every dedup TTL (max 24h) before each test so one test's
// timestamps never suppress the next.
let fakeNow = Date.parse('2026-10-03T12:00:00Z');

beforeAll(() => {
  initDb(':memory:');
});

beforeEach(() => {
  setSetting('sync_notifications', '[]');
  fakeNow += 25 * 3600_000;
  vi.useFakeTimers();
  vi.setSystemTime(fakeNow);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('isNewerVersion', () => {
  it('is true only when latest is strictly ahead', () => {
    expect(isNewerVersion('0.13.4', '0.3.0')).toBe(true);
    expect(isNewerVersion('1.2.4', '1.2.3')).toBe(true);
  });

  it('is false for equal, older, or unparseable versions', () => {
    expect(isNewerVersion('0.3.0', '0.3.0')).toBe(false);
    expect(isNewerVersion('0.2.9', '0.3.0')).toBe(false);
    // The old `!==` string compare notified on any difference, including
    // when the installed build was ahead of the release being compared.
    expect(isNewerVersion('0.3.0', '0.13.4')).toBe(false);
    expect(isNewerVersion('nightly', '0.3.0')).toBe(false);
    expect(isNewerVersion('0.13.4', 'nightly')).toBe(false);
  });
});

describe('emitDegradedNotif', () => {
  it('carries the i18n payload and no chrome message', () => {
    emitDegradedNotif(3, 5, 0.6);

    const [notif] = getNotifications();
    expect(notif).toBeDefined();
    expect(notif.type).toBe('degraded');
    expect(notif.message).toBe('');
    expect(notif.data?.key).toBe('notifications.degraded');
    expect(notif.data?.vars).toEqual({ healthy: 3, total: 5, pct: '60' });
    expect(unreadNotificationCount()).toBe(1);
  });

  it('deduplicates while degraded persists and clears on recovery', () => {
    emitDegradedNotif(3, 5, 0.6);
    emitDegradedNotif(2, 5, 0.4);
    expect(getNotifications()).toHaveLength(1);

    removeDegradedNotif();
    expect(getNotifications()).toHaveLength(0);
  });
});

describe('emitUpdateAvailableNotif', () => {
  it('carries the i18n payload and keeps release notes as the detail line', () => {
    emitUpdateAvailableNotif('0.14.0', 'Bug fixes and improvements', '');

    const [notif] = getNotifications();
    expect(notif.type).toBe('update_available');
    expect(notif.data?.key).toBe('notifications.updateAvailable');
    expect(notif.data?.vars).toEqual({ version: '0.14.0' });
    expect(notif.message).toBe('Bug fixes and improvements');
  });

  it('stays a single row across repeat checks and mark-all (no refill)', () => {
    emitUpdateAvailableNotif('0.14.0', null, '');
    emitUpdateAvailableNotif('0.14.0', null, '');
    expect(getNotifications()).toHaveLength(1);

    // Opening the bell marks everything else read, but a pending update row
    // deliberately survives — the badge must persist until the update lands.
    markNotificationsRead();
    expect(unreadNotificationCount()).toBe(1);

    // …and the next periodic check does NOT append a duplicate.
    emitUpdateAvailableNotif('0.14.0', null, '');
    expect(getNotifications()).toHaveLength(1);
    expect(unreadNotificationCount()).toBe(1);
  });

  it('replaces the previous row when the version advances', () => {
    emitUpdateAvailableNotif('0.14.0', null, '');
    emitUpdateAvailableNotif('0.15.0', null, '');

    const rows = getNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0].modelId).toBe('0.15.0');
    expect(rows[0].read).toBe(false);
  });
});

describe('settleUpdateAvailableNotif', () => {
  it('keeps the row as history, unpinned and read, and clears the badge', () => {
    emitUpdateAvailableNotif('0.14.0', null, '');

    fakeNow += 1000;
    vi.setSystemTime(fakeNow);
    emitDegradedNotif(3, 5, 0.6);

    // Pending: pinned on top even though the degraded event is newer.
    let rows = getNotifications();
    expect(rows[0].type).toBe('update_available');
    expect(rows[1].type).toBe('degraded');

    settleUpdateAvailableNotif();

    // Settled: still in the list, but plain chronological order again.
    rows = getNotifications();
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe('degraded');
    expect(rows[1].type).toBe('update_available');
    expect(rows[1].read).toBe(true);
    expect(unreadNotificationCount()).toBe(1); // only the degraded row
  });

  it('collapses historical duplicates down to the newest row', () => {
    // Simulate rows written by builds before the single-row contract.
    emitUpdateAvailableNotif('0.13.4', null, '');
    fakeNow += 1000;
    vi.setSystemTime(fakeNow);
    setSetting('sync_notifications', JSON.stringify([
      ...JSON.parse(getSetting('sync_notifications') ?? '[]'),
      { id: 'update-legacy-1', type: 'update_available', modelId: '0.13.4', displayName: 'old', platform: '', message: '', timestamp: fakeNow - 500, read: true },
      { id: 'update-legacy-2', type: 'update_available', modelId: '0.13.3', displayName: 'older', platform: '', message: '', timestamp: fakeNow - 900, read: true },
    ]));
    expect(getNotifications().filter(n => n.type === 'update_available')).toHaveLength(3);

    settleUpdateAvailableNotif();

    const updates = getNotifications().filter(n => n.type === 'update_available');
    expect(updates).toHaveLength(1);
    expect(updates[0].read).toBe(true);
    expect(updates[0].modelId).toBe('0.13.4');
  });
});

describe('checkUpdateAvailable', () => {
  const ORIGINAL_REPO = process.env.SROUTER_UPDATE_REPO;

  function stubFetch(impl: () => Promise<unknown>) {
    vi.stubGlobal('fetch', vi.fn(impl) as unknown as typeof fetch);
  }

  function stubRelease(tag: string) {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ tag_name: tag, body: 'release notes', html_url: 'https://example.invalid/r' }),
    }));
  }

  beforeEach(() => {
    setSetting('update_check_enabled', '1');
    delete process.env.SROUTER_UPDATE_REPO;
  });

  afterEach(() => {
    setSetting('update_check_enabled', '0');
    if (ORIGINAL_REPO === undefined) delete process.env.SROUTER_UPDATE_REPO;
    else process.env.SROUTER_UPDATE_REPO = ORIGINAL_REPO;
  });

  it('purges stale update rows and skips the network when no repository is configured', async () => {
    emitUpdateAvailableNotif('0.13.4', 'stale upstream row', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await checkUpdateAvailable();

    expect(getNotifications()).toHaveLength(0);
    expect(unreadNotificationCount()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('purges stale update rows when the check is switched off', async () => {
    process.env.SROUTER_UPDATE_REPO = 'example/srouter';
    setSetting('update_check_enabled', '0');
    emitUpdateAvailableNotif('0.13.4', 'stale upstream row', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await checkUpdateAvailable();

    expect(getNotifications()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('emits exactly one row for a newer release and keeps it across repeats', async () => {
    process.env.SROUTER_UPDATE_REPO = 'example/srouter';
    stubRelease('v99.99.99');

    await checkUpdateAvailable();
    await checkUpdateAvailable();

    const rows = getNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('update_available');
    expect(rows[0].read).toBe(false);
    expect(rows[0].data?.vars).toEqual({ version: '99.99.99' });
    expect(unreadNotificationCount()).toBe(1);
  });

  it('settles the row once the installed version caught up', async () => {
    process.env.SROUTER_UPDATE_REPO = 'example/srouter';
    emitUpdateAvailableNotif('0.13.4', null, '');
    stubRelease('v0.0.1'); // older than the installed build

    await checkUpdateAvailable();

    const rows = getNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('update_available');
    expect(rows[0].read).toBe(true);
    expect(unreadNotificationCount()).toBe(0);
  });

  it('keeps the existing row on a transient GitHub failure', async () => {
    process.env.SROUTER_UPDATE_REPO = 'example/srouter';
    emitUpdateAvailableNotif('0.13.4', null, '');
    stubFetch(async () => ({ ok: false, status: 500 }));

    await checkUpdateAvailable();

    const rows = getNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0].read).toBe(false);
  });
});

describe('removeNotificationsByType', () => {
  it('only removes the requested type', () => {
    emitDegradedNotif(3, 5, 0.6);
    emitUpdateAvailableNotif('0.14.0', null, '');

    removeNotificationsByType('update_available');
    const remaining = getNotifications();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].type).toBe('degraded');
  });
});
