/**
 * notification-emitter — centralized notification emission for server events.
 *
 * Simplified notification types:
 *  - Model catalog changes (added/removed/updated) — called from catalog-sync
 *  - Fleet degradation — called from degradation (auto-removed on recovery)
 *  - Update availability — called from boot + periodic check
 *
 * Health check, quota, and rate-limit events are handled internally
 * (auto-disable, cooldown, etc.) — no user-facing notifs needed.
 */

import { addNotifications, getNotifications, removeNotificationsByType, settleUpdateNotifications, type SyncNotification } from './catalog-sync.js';

// ── Deduplication ────────────────────────────────────────────────────────────
const recentEmit = new Map<string, number>();

const DEDUP_TTL: Record<string, number> = {
  degraded:         60 * 60_000,    // 1 hour — degraded state persists
};

function isDeduplicated(type: string, dedupKey: string): boolean {
  const fullKey = `${type}:${dedupKey}`;
  const last = recentEmit.get(fullKey) ?? 0;
  const ttl = DEDUP_TTL[type] ?? 30_000;
  if (Date.now() - last < ttl) return true;
  recentEmit.set(fullKey, Date.now());
  return false;
}

// ── Degraded ─────────────────────────────────────────────────────────────────

export function emitDegradedNotif(healthyProviders: number, totalProviders: number, ratio: number): void {
  if (isDeduplicated('degraded', 'enter')) return;
  const now = Date.now();
  const pct = (ratio * 100).toFixed(0);
  const notif: SyncNotification = {
    id: `degraded-${now}`,
    type: 'degraded',
    modelId: '*',
    displayName: 'Mode degraded aktif',
    platform: '',
    // Chrome lives in the localized title; nothing left to show below it.
    message: '',
    data: {
      key: 'notifications.degraded',
      vars: { healthy: healthyProviders, total: totalProviders, pct },
    },
    timestamp: now,
    read: false,
  };
  addNotifications([notif]);
}

/**
 * Remove all degraded notifications when the system recovers.
 * No separate "recovered" notification — the degraded one just disappears.
 */
export function removeDegradedNotif(): void {
  removeNotificationsByType('degraded');
}

// ── Update Available ─────────────────────────────────────────────────────────

export function emitUpdateAvailableNotif(version: string | null, remoteMessage: string | null, _htmlUrl: string): void {
  const versionStr = version ?? 'baru';
  const modelId = version ?? 'latest';
  const existing = getNotifications().find(n => n.type === 'update_available');
  // Exactly ONE update row at any time, and it is unread while an update
  // applies (the periodic check keeps re-running): a repeat check for the
  // same version is a no-op — this is what stops the bell from refilling a
  // freshly-marked-read list with duplicates every few minutes. A different
  // version replaces the old row, collapsing any duplicates with it.
  if (existing && existing.modelId === modelId && !existing.read) return;
  if (existing) removeNotificationsByType('update_available');

  const detail = remoteMessage ? remoteMessage.slice(0, 100) : '';
  const notif: SyncNotification = {
    id: `update-${Date.now()}-${modelId}`,
    type: 'update_available',
    modelId,
    displayName: `Update tersedia: v${versionStr}`,
    platform: '',
    // The sentence is localized via data.key; message carries only the
    // upstream release-notes excerpt (content, not chrome).
    message: detail,
    data: { key: 'notifications.updateAvailable', vars: { version: versionStr } },
    timestamp: Date.now(),
    read: false,
  };
  addNotifications([notif]);
}

/**
 * Settle the update reminder after the installed version caught up: the row
 * stays in the list (history), but marked read — it un-pins from the top of
 * the bell and sinks into normal chronological order, and the badge clears.
 */
export function settleUpdateAvailableNotif(): void {
  settleUpdateNotifications();
}

/** Remove update-notif after user performs the update. */
export function removeUpdateAvailableNotif(): void {
  removeNotificationsByType('update_available');
}

// ── Periodic checks ──────────────────────────────────────────────────────────

/**
 * True when `latest` is strictly newer than `current` by semver.
 * Unparseable versions never notify — a false "update available" is worse
 * than a missed one (the old `!==` compare notified even when the installed
 * version was ahead of the release being compared).
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string): [number, number, number] | null => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/**
 * Check for server updates and emit a notification if one is available.
 * Called on boot (via catalog-sync) and periodically via health checker.
 *
 * The repository is NOT defaulted: this fork replaces upstream and publishes
 * no releases of its own yet, so checking upstream would announce every
 * upstream tag (e.g. v0.13.4 > 0.3.1) as an endless "update available".
 * SROUTER_UPDATE_REPO must name the fork's own owner/repo before anything is
 * checked — otherwise any stored update row is stale and gets dropped.
 */
export async function checkUpdateAvailable(): Promise<void> {
  try {
    const { getSetting } = await import('../db/index.js');
    const repo = process.env.SROUTER_UPDATE_REPO?.trim();
    if (getSetting('update_check_enabled') !== '1' || !repo) {
      removeNotificationsByType('update_available');
      return;
    }

    const { getAppVersion } = await import('../lib/app-version.js');
    const version = getAppVersion();
    if (!version) {
      removeNotificationsByType('update_available');
      return;
    }

    const resp = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return; // transient — keep whatever row already exists

    const body = await resp.json() as { tag_name?: string; name?: string; body?: string; html_url?: string };
    const latestTag = body.tag_name;
    if (!latestTag) return;

    // Clean tag: "v1.2.3" → "1.2.3"
    const cleanLatest = latestTag.replace(/^v/i, '');
    const cleanCurrent = version.replace(/^v/i, '');

    if (isNewerVersion(cleanLatest, cleanCurrent)) {
      emitUpdateAvailableNotif(cleanLatest, body.body?.slice(0, 200) ?? null, body.html_url ?? '');
    } else {
      // Installed build caught up (or is ahead): unpin, mark read, sink into
      // chronological order. The row is kept as history, never duplicated.
      settleUpdateAvailableNotif();
    }
  } catch {
    // GitHub unreachable or rate-limited — silently skip
  }
}

/**
 * Run all periodic notification checks. Called from the health checker pass
 * (every ~5 min) to surface quota + update warnings alongside health events.
 */
export function runPeriodicNotificationChecks(): void {
  void checkUpdateAvailable();
}