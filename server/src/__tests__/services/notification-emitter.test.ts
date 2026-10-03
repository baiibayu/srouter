import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { initDb, setSetting } from '../../db/index.js';
import {
  emitDegradedNotif,
  removeDegradedNotif,
  emitUpdateAvailableNotif,
  isNewerVersion,
} from '../../services/notification-emitter.js';
import {
  getNotifications,
  unreadNotificationCount,
  markNotificationsRead,
  removeNotificationsByType,
} from '../../services/catalog-sync.js';

// Locks the notification emission contract: degraded + update rows carry the
// i18n payload the dashboard renders, the update check only fires on a real
// newer release, and dedup keeps repeats out of the bell.

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

describe('isNewerVersion', () => {
  it('is true only when latest is strictly ahead', () => {
    expect(isNewerVersion('0.13.4', '0.3.0')).toBe(true);
    expect(isNewerVersion('1.2.4', '1.2.3')).toBe(true);
  });

  it('is false for equal, older, or unparseable versions', () => {
    expect(isNewerVersion('0.3.0', '0.3.0')).toBe(false);
    expect(isNewerVersion('0.2.9', '0.3.0')).toBe(false);
    // The old `!==` string compare notified on any difference, including
    // when the installed build was ahead of the checked release.
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

  it('stays deduplicated while unread, reminds again after read', () => {
    emitUpdateAvailableNotif('0.14.0', null, '');
    emitUpdateAvailableNotif('0.14.0', null, '');
    expect(getNotifications()).toHaveLength(1);

    markNotificationsRead();
    emitUpdateAvailableNotif('0.14.0', null, '');
    expect(getNotifications()).toHaveLength(2);
    expect(unreadNotificationCount()).toBe(1);
  });

  it('notifies independently per version', () => {
    emitUpdateAvailableNotif('0.14.0', null, '');
    emitUpdateAvailableNotif('0.15.0', null, '');
    expect(getNotifications()).toHaveLength(2);
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
