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

import { addNotifications, getNotifications, removeNotificationsByType, type SyncNotification } from './catalog-sync.js';

// ── Deduplication ────────────────────────────────────────────────────────────
const recentEmit = new Map<string, number>();

const DEDUP_TTL: Record<string, number> = {
  degraded:         60 * 60_000,    // 1 hour — degraded state persists
  update_available: 24 * 60 * 60_000, // 24 hours
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
    message: `Hanya ${healthyProviders}/${totalProviders} provider sehat (${pct}%) — routing dibatasi`,
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
  const existing = getNotifications().find(
    n => n.type === 'update_available' && !n.read && n.modelId === (version ?? 'latest'),
  );
  if (existing) return;

  const now = Date.now();
  const versionStr = version ?? 'baru';
  const detail = remoteMessage ? ` — ${remoteMessage.slice(0, 100)}` : '';
  const notif: SyncNotification = {
    id: `update-${now}-${version ?? 'latest'}`,
    type: 'update_available',
    modelId: version ?? 'latest',
    displayName: `Update tersedia: v${versionStr}`,
    platform: '',
    message: `Versi baru v${versionStr} tersedia${detail}`,
    timestamp: now,
    read: false,
  };
  addNotifications([notif]);
}

/** Remove update-notif after user performs the update. */
export function removeUpdateAvailableNotif(): void {
  removeNotificationsByType('update_available');
}

// ── Periodic checks ──────────────────────────────────────────────────────────

/**
 * Check for server updates and emit a notification if one is available.
 * Called on boot (via catalog-sync) and periodically via health checker.
 */
export async function checkUpdateAvailable(): Promise<void> {
  try {
    const { getSetting } = await import('../db/index.js');
    if (getSetting('update_check_enabled') !== '1') return;

    const { getAppVersion } = await import('../lib/app-version.js');
    const version = getAppVersion();
    if (!version) return;

    // Use GitHub API to check latest release
    const resp = await fetch('https://api.github.com/repos/tashfeenahmed/freellmapi/releases/latest', {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return;

    const body = await resp.json() as { tag_name?: string; name?: string; body?: string; html_url?: string };
    const latestTag = body.tag_name;
    if (!latestTag) return;

    // Clean tag: "v1.2.3" → "1.2.3"
    const cleanLatest = latestTag.replace(/^v/i, '');
    const cleanCurrent = version.replace(/^v/i, '');

    // Simple string comparison — if latest is newer, notify
    // (We use the GitHub comparison as the source of truth)
    if (cleanLatest !== cleanCurrent) {
      emitUpdateAvailableNotif(cleanLatest, body.body?.slice(0, 200) ?? null, body.html_url ?? '');
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