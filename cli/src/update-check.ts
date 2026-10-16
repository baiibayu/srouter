import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Boot-time availability notice for `srouter serve`.
 *
 * Anti-spam is the whole point of this module:
 *   - at most one registry fetch per 24h (cached in the data directory),
 *   - each version announced on stdout exactly once for that data directory,
 *   - any failure (offline, firewall, registry down) prints nothing at all,
 *   - the caller never awaits an unhandled rejection — a notice is never able
 *     to disturb the gateway it rides on.
 */
export const LATEST_URL = 'https://registry.npmjs.org/@baiibayu/srouter/latest';
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface UpdateCache {
  /** Last *successful* fetch. Failures leave this untouched so the next boot
   *  retries immediately instead of staying silent for a whole day. */
  lastCheckAt?: number;
  /** Newest version ever seen from the registry. */
  latest?: string;
  /** The version already written to stdout — announced at most once. */
  notified?: string;
}

interface Semver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

const SEMVER_PATTERN
  = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function parseSemver(version: string): Semver | null {
  const match = SEMVER_PATTERN.exec(version.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function comparePrerelease(left: string[], right: string[]): number {
  // No prerelease outranks any prerelease of the same base (1.0.0 > 1.0.0-rc.1).
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1; // a shorter identifier set sorts lower
    if (b === undefined) return 1;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const difference = Number(a) - Number(b);
      if (difference !== 0) return difference > 0 ? 1 : -1;
      continue;
    }
    // Numeric identifiers always have lower precedence than alphanumeric ones.
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    if (a !== b) return a > b ? 1 : -1;
  }
  return 0;
}

function compareParsed(left: Semver, right: Semver): number {
  if (left.major !== right.major) return left.major > right.major ? 1 : -1;
  if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1;
  if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1;
  return comparePrerelease(left.prerelease, right.prerelease);
}

/** Semver precedence: >0 when candidate is ahead of current. Unrecognized input
 *  never notifies — a typo'd local version must not produce a false banner. */
export function isNewer(candidate: string, current: string): boolean {
  const left = parseSemver(candidate);
  const right = parseSemver(current);
  if (!left || !right) return false;
  return compareParsed(left, right) > 0;
}

/** The version of this installed copy, read from the package manifest next to
 *  dist/ (present in both the workspace checkout and the published tarball). */
export function currentVersion(): string {
  try {
    const manifest = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' && parseSemver(parsed.version)
      ? parsed.version
      : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function cachePath(dataDir: string): string {
  return path.join(dataDir, 'update-check.json');
}

export function loadCache(dataDir: string): UpdateCache {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath(dataDir), 'utf8')) as UpdateCache;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCache(dataDir: string, cache: UpdateCache): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(cachePath(dataDir), `${JSON.stringify(cache, null, 2)}\n`);
  } catch {
    // A notice cache that cannot be written is not worth failing a boot over;
    // the worst case is one repeated line until the directory becomes writable.
  }
}

/** Registry lookup. Any failure answers null — the notice simply doesn't fire. */
export async function fetchLatest(): Promise<string | null> {
  try {
    const response = await fetch(LATEST_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return null;
    const body = await response.json() as { version?: unknown };
    return typeof body.version === 'string' && parseSemver(body.version) ? body.version : null;
  } catch {
    return null;
  }
}

export interface CheckResult {
  /** Newest known version (cached or freshly fetched), null when none known. */
  latest: string | null;
  /** True exactly once per version: print the line. */
  notify: boolean;
}

export interface CheckOptions {
  /** Injected clock for tests. */
  now?: number;
  /** Injected registry lookup for tests. */
  fetchLatest?: () => Promise<string | null>;
}

export async function checkForUpdate(
  current: string,
  dataDir: string,
  options: CheckOptions = {},
): Promise<CheckResult> {
  const now = options.now ?? Date.now();
  const cache = loadCache(dataDir);
  let latest = cache.latest ?? null;

  const stale = cache.lastCheckAt === undefined || now - cache.lastCheckAt >= CHECK_INTERVAL_MS;
  if (stale) {
    const fetched = await (options.fetchLatest ?? fetchLatest)();
    // Only a successful fetch advances the throttle — an offline boot keeps
    // retrying on the next boot instead of muting itself for 24 hours.
    if (fetched) {
      latest = fetched;
      cache.latest = fetched;
      cache.lastCheckAt = now;
      saveCache(dataDir, cache);
    }
  }

  const notify = latest !== null && isNewer(latest, current) && cache.notified !== latest;
  if (notify && latest !== null) {
    cache.notified = latest;
    saveCache(dataDir, cache);
  }
  return { latest, notify };
}

/** The one-line boot notice, or null when there is nothing (new) to say.
 *  Never rejects: this runs detached from `serve`. */
export async function bootNotice(dataDir: string, current: string): Promise<string | null> {
  try {
    const { latest, notify } = await checkForUpdate(current, dataDir);
    if (!notify || !latest) return null;
    return `[srouter] ${latest} available (you have ${current}) — run 'srouter update'`;
  } catch {
    return null;
  }
}
