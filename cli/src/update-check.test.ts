import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHECK_INTERVAL_MS,
  bootNotice,
  cachePath,
  checkForUpdate,
  currentVersion,
  isNewer,
  loadCache,
  parseSemver,
  saveCache,
} from './update-check.js';

const temporary: string[] = [];
function tempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srouter-update-'));
  temporary.push(dir);
  return dir;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('parseSemver', () => {
  it('accepts the shapes npm serves and drops junk', () => {
    expect(parseSemver('0.1.31')).toMatchObject({ major: 0, minor: 1, patch: 31, prerelease: [] });
    expect(parseSemver('v1.2.3')).toMatchObject({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('1.0.0-rc.1+build.9')?.prerelease).toEqual(['rc', '1']);
    expect(parseSemver('1.0.0+build.9')).toMatchObject({ prerelease: [] });
    expect(parseSemver('  0.2.0 ')).toMatchObject({ minor: 2 });
    expect(parseSemver('latest')).toBeNull();
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('')).toBeNull();
  });
});

describe('isNewer — semver precedence', () => {
  it('orders by major.minor.patch, jump versions included', () => {
    expect(isNewer('0.2.0', '0.1.9')).toBe(true);
    expect(isNewer('1.0.0', '0.9.9')).toBe(true);
    expect(isNewer('0.1.31', '0.1.31')).toBe(false);
    expect(isNewer('0.1.2', '0.1.31')).toBe(false);
    expect(isNewer('v0.2.0', '0.1.31')).toBe(true);
  });

  it('treats any prerelease as older than its release', () => {
    expect(isNewer('1.0.0', '1.0.0-rc.1')).toBe(true);
    expect(isNewer('1.0.0-rc.1', '1.0.0')).toBe(false);
    expect(isNewer('1.0.0-rc.2', '1.0.0-rc.1')).toBe(true);
    expect(isNewer('1.0.0-alpha.1', '1.0.0-alpha')).toBe(true);
    expect(isNewer('1.0.0-2', '1.0.0-alpha')).toBe(false); // numeric < alphanumeric
    expect(isNewer('1.0.0-rc.10', '1.0.0-rc.9')).toBe(true); // numeric compare, not string
  });

  it('ignores build metadata and never notifies on unrecognized input', () => {
    expect(isNewer('0.1.31+build.7', '0.1.31')).toBe(false);
    expect(isNewer('garbage', '0.1.31')).toBe(false);
    expect(isNewer('0.1.4', 'not-a-version')).toBe(false);
  });
});

describe('currentVersion', () => {
  it('reads the version from the cli package manifest', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
    ) as { version: string };
    expect(currentVersion()).toBe(manifest.version);
    expect(parseSemver(currentVersion())).not.toBeNull();
  });
});

describe('cache persistence', () => {
  it('roundtrips and survives a missing or corrupt file', () => {
    const dir = tempDataDir();
    expect(cachePath(dir)).toBe(path.join(dir, 'update-check.json'));
    expect(loadCache(dir)).toEqual({}); // nothing written yet

    saveCache(dir, { lastCheckAt: 1, latest: '0.2.0', notified: '0.2.0' });
    expect(loadCache(dir)).toEqual({ lastCheckAt: 1, latest: '0.2.0', notified: '0.2.0' });

    fs.writeFileSync(cachePath(dir), 'not json{');
    expect(loadCache(dir)).toEqual({});
  });
});

describe('checkForUpdate — throttle, once-per-version, offline', () => {
  const T0 = 1_700_000_000_000;

  it('announces a newer version exactly once, then stays quiet for 24h', async () => {
    const dir = tempDataDir();
    const fetcher = vi.fn(async () => '0.2.0');

    const first = await checkForUpdate('0.1.31', dir, { now: T0, fetchLatest: fetcher });
    expect(first).toEqual({ latest: '0.2.0', notify: true });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const second = await checkForUpdate('0.1.31', dir, { now: T0 + 1000, fetchLatest: fetcher });
    expect(second.notify).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1); // throttled — no registry hit

    const nextDay = await checkForUpdate('0.1.31', dir, {
      now: T0 + CHECK_INTERVAL_MS,
      fetchLatest: fetcher,
    });
    expect(nextDay.latest).toBe('0.2.0');
    expect(nextDay.notify).toBe(false); // already announced
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('announces again only when a newer version replaces the old one', async () => {
    const dir = tempDataDir();
    await checkForUpdate('0.1.31', dir, { now: T0, fetchLatest: async () => '0.2.0' });

    const later = T0 + CHECK_INTERVAL_MS;
    const again = await checkForUpdate('0.1.31', dir, { now: later, fetchLatest: async () => '0.2.0' });
    expect(again.notify).toBe(false);

    const bumped = await checkForUpdate('0.1.31', dir, {
      now: later + CHECK_INTERVAL_MS,
      fetchLatest: async () => '0.3.0',
    });
    expect(bumped.notify).toBe(true);
  });

  it('does not throttle after a failed fetch — the next boot retries', async () => {
    const dir = tempDataDir();
    const failing = vi.fn(async () => null);
    const first = await checkForUpdate('0.1.31', dir, { now: T0, fetchLatest: failing });
    expect(first).toEqual({ latest: null, notify: false });
    expect(loadCache(dir).lastCheckAt).toBeUndefined();

    const recovering = vi.fn(async () => '0.2.0');
    const second = await checkForUpdate('0.1.31', dir, { now: T0 + 1000, fetchLatest: recovering });
    expect(second.notify).toBe(true);
    expect(recovering).toHaveBeenCalledTimes(1);
  });

  it('never announces when the installed copy is not behind', async () => {
    const dir = tempDataDir();
    const current = await checkForUpdate('0.3.0', dir, {
      now: T0,
      fetchLatest: async () => '0.2.0',
    });
    expect(current.notify).toBe(false);
  });

  it('keeps the notice cache per data directory', async () => {
    const dirA = tempDataDir();
    const dirB = tempDataDir();
    const fetcher = async () => '0.2.0';
    expect((await checkForUpdate('0.1.31', dirA, { now: T0, fetchLatest: fetcher })).notify).toBe(true);
    expect((await checkForUpdate('0.1.31', dirB, { now: T0, fetchLatest: fetcher })).notify).toBe(true);
    expect((await checkForUpdate('0.1.31', dirA, { now: T0, fetchLatest: fetcher })).notify).toBe(false);
  });
});

describe('bootNotice — the exact line, or silence', () => {
  it('formats the notice with both versions exactly once', async () => {
    const dir = tempDataDir();
    // A fresh cache holding a newer version: no registry hit, fully deterministic.
    saveCache(dir, { lastCheckAt: Date.now(), latest: '0.2.0' });
    expect(await bootNotice(dir, '0.1.31'))
      .toBe("[srouter] 0.2.0 available (you have 0.1.31) — run 'srouter update'");
    expect(await bootNotice(dir, '0.1.31')).toBeNull(); // already announced
  });

  it('returns null instead of throwing when the registry lookup dies', async () => {
    const dir = tempDataDir();
    const original = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    try {
      expect(await bootNotice(dir, '0.1.31')).toBeNull();
      expect(loadCache(dir).lastCheckAt).toBeUndefined(); // no throttle after a failure
    } finally {
      globalThis.fetch = original;
    }
  });

  it('returns null when the installed copy is up to date', async () => {
    const dir = tempDataDir();
    saveCache(dir, { lastCheckAt: Date.now(), latest: '0.1.31' });
    expect(await bootNotice(dir, '0.1.31')).toBeNull();
  });
});
