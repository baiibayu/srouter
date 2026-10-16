/**
 * Pure decision layer for the in-app updater. Everything with side effects —
 * electron-updater, dialogs, the config file — lives in updater.ts; this file
 * exists so the *decisions* are testable without Electron.
 */

/** First check runs this long after a successful boot: gives the machine time
 *  to join the network and the user time to start their day before anything
 *  talks to GitHub. */
export const UPDATE_STARTUP_DELAY_MS = 30_000;

/** Feed lookups never exceed one per window — persisted in the desktop config,
 *  so the cap holds across restarts, not just within one session. */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface UpdateCheckInput {
  isPackaged: boolean;
  platform: string;
  /** True only for the AppImage artifact (process.env.APPIMAGE set). */
  isAppImage: boolean;
  lastUpdateCheckAt?: number;
  now: number;
}

export function shouldCheck(input: UpdateCheckInput): boolean {
  // Dev runs `electron .` straight from the checkout — never self-update over
  // a developer's work in progress.
  if (!input.isPackaged) return false;
  // deb/rpm/tar.xz belong to apt/dnf: replacing their files behind the package
  // manager's back breaks them. AppImage (and the Windows/macOS builds) are
  // the self-updating artifacts.
  if (input.platform === 'linux' && !input.isAppImage) return false;
  if (input.lastUpdateCheckAt !== undefined) {
    const elapsed = input.now - input.lastUpdateCheckAt;
    // elapsed < 0 means the clock moved backwards (NTP step, manual change) —
    // don't let that mute update checks for hours.
    if (elapsed >= 0 && elapsed < UPDATE_CHECK_INTERVAL_MS) return false;
  }
  return true;
}

/** electron-updater only emits `update-downloaded` for a version that IS newer
 *  than the running one; this enforces the once-per-version prompt on top. */
export function shouldNotify(newestVersion: string, notifiedVersion?: string): boolean {
  return notifiedVersion !== newestVersion;
}
