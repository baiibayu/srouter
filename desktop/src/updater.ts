import { app, dialog } from 'electron';
import electronUpdater from 'electron-updater';
import { loadConfig, saveConfig } from './config.js';
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_STARTUP_DELAY_MS,
  shouldCheck,
  shouldNotify,
} from './update-policy.js';

const { autoUpdater } = electronUpdater;

/** The download is done at this point — ask once per version, never again. */
function notifyUpdateReady(version: string): void {
  const cfg = loadConfig();
  if (!shouldNotify(version, cfg.updateNotifiedVersion)) return;
  // Persist *before* showing: a crash while the prompt is open must not
  // re-announce the same release on the next boot.
  saveConfig({ ...cfg, updateNotifiedVersion: version });
  void dialog
    .showMessageBox({
      type: 'info',
      title: 'SRouter update ready',
      message: `SRouter ${version} has been downloaded and is ready to install.`,
      detail:
        'Install & Restart applies it now. Quitting the app any other way '
        + 'installs it too — nothing else to remember.',
      buttons: ['Install & Restart', 'Later'],
      defaultId: 1,
      cancelId: 1,
    })
    .then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    })
    .catch(() => {
      // A prompt that cannot be shown is not worth a retry loop; the same
      // release stays installed silently until the user quits.
    });
}

/**
 * Wire electron-updater to the GitHub release feeds the workflow already
 * publishes (latest*.yml next to the installers; publish config in
 * electron-builder.yml). Safe by construction:
 *   - no-op in dev builds and on deb/rpm/tar.xz Linux installs,
 *   - checks delayed 30s after boot, at most once per 24h,
 *   - fully silent when offline (the error is logged, never surfaced),
 *   - the "update ready" prompt shows at most once per version,
 *   - install also happens automatically on quit either way.
 */
export function initUpdater(): void {
  if (!app.isPackaged) return;
  if (process.platform === 'linux' && !process.env.APPIMAGE) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', info => notifyUpdateReady(info.version));
  autoUpdater.on('error', (err: unknown) => {
    // Offline / GitHub unreachable / bad feed: logged only, retried at the
    // next interval. update checks must never interrupt the gateway.
    console.warn('[desktop] update check failed:', err instanceof Error ? err.message : err);
  });

  const check = async (): Promise<void> => {
    const now = Date.now();
    const cfg = loadConfig();
    if (!shouldCheck({
      isPackaged: app.isPackaged,
      platform: process.platform,
      isAppImage: process.env.APPIMAGE !== undefined,
      lastUpdateCheckAt: cfg.lastUpdateCheckAt,
      now,
    })) return;
    try {
      await autoUpdater.checkForUpdates();
      // Only a successful lookup advances the throttle; a failed one retries
      // on the next tick instead of muting itself for a whole day.
      saveConfig({ ...loadConfig(), lastUpdateCheckAt: now });
    } catch {
      // The 'error' event above already logged it.
    }
  };

  setTimeout(() => {
    void check();
    setInterval(() => void check(), UPDATE_CHECK_INTERVAL_MS);
  }, UPDATE_STARTUP_DELAY_MS);
}
