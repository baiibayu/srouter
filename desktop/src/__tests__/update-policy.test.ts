import { describe, expect, it } from 'vitest';
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_STARTUP_DELAY_MS,
  shouldCheck,
  shouldNotify,
} from '../update-policy.js';

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function base(overrides: Partial<Parameters<typeof shouldCheck>[0]> = {}) {
  return { isPackaged: true, platform: 'win32', isAppImage: false, now: T0, ...overrides };
}

describe('shouldCheck', () => {
  it('gives a packaged app its first check when nothing was ever checked', () => {
    expect(shouldCheck(base())).toBe(true);
  });

  it('never checks a dev checkout', () => {
    expect(shouldCheck(base({ isPackaged: false }))).toBe(false);
  });

  it('throttles to at most one check per 24h', () => {
    expect(shouldCheck(base({ lastUpdateCheckAt: T0 - HOUR }))).toBe(false);
    expect(shouldCheck(base({ lastUpdateCheckAt: T0 - 23 * HOUR }))).toBe(false);
    expect(shouldCheck(base({ lastUpdateCheckAt: T0 - 24 * HOUR }))).toBe(true);
    expect(shouldCheck(base({ lastUpdateCheckAt: T0 - 48 * HOUR }))).toBe(true);
  });

  it('lets a backwards clock step through instead of muting updates', () => {
    expect(shouldCheck(base({ lastUpdateCheckAt: T0 + HOUR }))).toBe(true);
  });

  it('skips deb/rpm/tar.xz on Linux but checks the AppImage', () => {
    expect(shouldCheck(base({ platform: 'linux' }))).toBe(false);
    expect(shouldCheck(base({ platform: 'linux', isAppImage: true }))).toBe(true);
  });

  it('checks the other platforms when packaged', () => {
    expect(shouldCheck(base({ platform: 'darwin' }))).toBe(true);
    expect(shouldCheck(base({ platform: 'win32' }))).toBe(true);
  });
});

describe('shouldNotify', () => {
  it('announces each version exactly once', () => {
    expect(shouldNotify('0.2.0', undefined)).toBe(true);
    expect(shouldNotify('0.2.0', '0.2.0')).toBe(false);
    expect(shouldNotify('0.3.0', '0.2.0')).toBe(true);
  });
});

describe('schedule constants', () => {
  it('matches the documented cadence', () => {
    expect(UPDATE_STARTUP_DELAY_MS).toBe(30_000);
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
