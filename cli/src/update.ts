import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { currentVersion, fetchLatest, isNewer } from './update-check.js';

/**
 * `srouter update` — manual by design. Nothing in the CLI ever upgrades itself
 * without this command: the boot notice in serve only *says* a version exists,
 * and the user decides when (if ever) to move. `--check` reports and exits.
 */

export type InstallMode = 'global' | 'npx' | 'local' | 'foreign';

export interface ModeContext {
  /** Real path of the running entry (argv[1]), when resolvable. */
  scriptPath?: string;
  /** Output of `npm root -g` for the active Node — null when npm is broken. */
  globalRoot?: string | null;
}

function isUnder(candidate: string, root: string): boolean {
  const target = path.resolve(candidate);
  const parent = path.resolve(root);
  return target === parent || target.startsWith(`${parent}${path.sep}`);
}

/** Where this copy was installed from. Checks are ordered by specificity:
 *  the npx cache and the global root are unambiguous path shapes, package
 *  managers other than npm are recognized by their directory names, and
 *  everything else (project installs included) falls through to 'local'. */
export function resolveInstallMode(context: ModeContext): InstallMode {
  const script = context.scriptPath;
  if (!script) return 'local';
  // npx's execution cache: <npm-cache>/_npx/<hash>/node_modules/... — the
  // platform differs (Linux ~/.npm/_npx vs Windows %LocalAppData%\npm-cache\_npx)
  // but the _npx segment is constant.
  if (/[/\\]_npx[/\\]/.test(script)) return 'npx';
  if (context.globalRoot && isUnder(script, context.globalRoot)) return 'global';
  // A segment that is exactly pnpm/yarn/bun, with or without the leading dot
  // that every tool prefers on disk (.bun, .yarn, .pnpm vs plain pnpm/).
  if (/(?:^|[/\\])\.?(?:pnpm|yarn|bun)(?:$|[/\\])/i.test(script)) return 'foreign';
  return 'local';
}

function foreignTool(scriptPath: string | undefined): string {
  const match = scriptPath?.match(/(?:^|[/\\])\.?(pnpm|yarn|bun)(?:$|[/\\])/i);
  return match?.[1]?.toLowerCase() ?? 'your package manager';
}

function modeHint(mode: InstallMode, scriptPath?: string): string {
  switch (mode) {
    case 'npx':
      return 'This copy runs through npx — there is nothing installed to update.\n'
        + 'Install it once globally:\n  npm install -g @baiibayu/srouter\n';
    case 'foreign': {
      const tool = foreignTool(scriptPath);
      const command = tool === 'pnpm' ? 'pnpm add -g @baiibayu/srouter@latest'
        : tool === 'yarn' ? 'yarn global upgrade @baiibayu/srouter'
          : 'bun add -g @baiibayu/srouter@latest';
      return `This copy was installed with ${tool} — update it with the same tool:\n  ${command}\n`;
    }
    case 'local':
      return "This copy belongs to a project's node_modules — update it inside that project:\n"
        + '  npm install @baiibayu/srouter@latest\n';
    default:
      return '';
  }
}

export function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

/** Global install root of the *active* Node (`npm root -g`), null on failure.
 *  Compared against the real entry path to tell a global install from a local
 *  one — both live under a node_modules directory. */
export function npmGlobalRoot(): string | null {
  try {
    const result = spawnSync(npmCommand(), ['root', '-g'], {
      encoding: 'utf8',
      timeout: 15_000,
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    if (result.status !== 0) return null;
    const root = (result.stdout ?? '').trim();
    return root === '' ? null : root;
  } catch {
    return null;
  }
}

export function installGlobal(): number | null {
  try {
    const result = spawnSync(npmCommand(), ['install', '-g', '@baiibayu/srouter@latest'], {
      stdio: 'inherit',
      timeout: 300_000,
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    if (result.error) return null;
    return result.status;
  } catch {
    return null;
  }
}

function runningScriptPath(): string | undefined {
  try {
    return fs.realpathSync(process.argv[1]);
  } catch {
    return process.argv[1];
  }
}

export interface UpdateOptions {
  /** Report only: never install, exit 1 when a newer version exists. */
  check?: boolean;
}

export interface UpdateDeps {
  fetchLatest?: () => Promise<string | null>;
  currentVersion?: () => string;
  scriptPath?: () => string | undefined;
  globalRoot?: () => string | null;
  install?: () => number | null;
}

export async function runUpdate(
  options: UpdateOptions = {},
  deps: UpdateDeps = {},
): Promise<number> {
  const current = (deps.currentVersion ?? currentVersion)();

  if (options.check) {
    const latest = await (deps.fetchLatest ?? fetchLatest)();
    if (!latest) {
      process.stderr.write("srouter: could not reach the npm registry — try again later\n");
      return 1;
    }
    if (isNewer(latest, current)) {
      process.stdout.write(
        `${current} → ${latest} available — run 'srouter update' to install it\n`,
      );
      return 1;
    }
    process.stdout.write(`up to date (${current})\n`);
    return 0;
  }

  const scriptPath = (deps.scriptPath ?? runningScriptPath)();
  const mode = resolveInstallMode({ scriptPath, globalRoot: (deps.globalRoot ?? npmGlobalRoot)() });
  if (mode !== 'global') {
    process.stdout.write(modeHint(mode, scriptPath));
    return 1;
  }

  process.stdout.write(`Updating @baiibayu/srouter (you have ${current})…\n`);
  const status = (deps.install ?? installGlobal)();
  if (status !== 0) {
    process.stderr.write(
      `srouter: npm install failed${status === null ? '' : ` (exit ${status})`} — `
      + 'if npm reported EACCES, retry with sudo or fix your npm global prefix\n',
    );
    return status ?? 1;
  }
  process.stdout.write('Updated — restart the gateway to run the new version.\n');
  return 0;
}
