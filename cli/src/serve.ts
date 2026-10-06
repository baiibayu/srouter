import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export interface ServeOptions {
  port?: number;
  host?: string;
  openBrowser: boolean;
  dataDir?: string;
}

const SERVE_VALUE_FLAGS = new Set(['--port', '--host', '--data-dir']);

export function isServeFlag(arg: string): boolean {
  const flag = arg.split('=', 1)[0];
  return flag === '--no-browser' || SERVE_VALUE_FLAGS.has(flag);
}

export function parseServeFlags(args: string[]): ServeOptions {
  const options: ServeOptions = { openBrowser: true };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('-')) {
      throw new Error(`serve takes no positional arguments, got '${arg}'`);
    }
    const equals = arg.indexOf('=');
    const flag = equals < 0 ? arg : arg.slice(0, equals);
    const inline = equals < 0 ? undefined : arg.slice(equals + 1);
    if (flag === '--no-browser') {
      options.openBrowser = false;
      continue;
    }
    if (!SERVE_VALUE_FLAGS.has(flag)) throw new Error(`Unknown option: ${arg}`);
    const value = inline ?? args[index + 1];
    if (inline === undefined) index += 1;
    if (!value || (inline === undefined && value.startsWith('-'))) {
      throw new Error(`${flag} requires a value`);
    }
    if (flag === '--port') {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`--port must be an integer between 1 and 65535, got '${value}'`);
      }
      options.port = port;
    } else if (flag === '--host') options.host = value;
    else options.dataDir = value;
  }
  return options;
}

/**
 * Which argv shapes start the gateway. Bare `srouter` runs it (the 9router
 * parity path), as do `serve`/`start` and a leading serve flag; everything
 * else — help included — falls through to the existing setup/keys dispatch.
 */
export function resolveServe(argv: string[]): ServeOptions | null {
  if (argv.includes('--help') || argv.includes('-h') || argv[0] === 'help') return null;
  if (argv.length === 0) return { openBrowser: true };
  if (argv[0] === 'serve' || argv[0] === 'start') return parseServeFlags(argv.slice(1));
  if (argv[0].startsWith('-') && isServeFlag(argv[0])) return parseServeFlags(argv);
  return null;
}

// Platform opener with no new dependency: `start` needs the empty title
// argument on Windows, the others take the URL directly. Failures are
// swallowed — a headless box still gets the printed URL.
function openBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Nothing actionable: the URL is already printed on stdout.
  }
}

function dashboardUrl(host: string | undefined, port: number): string {
  const raw = (host ?? process.env.HOST ?? '::').trim();
  const wildcard = raw === '' || raw === '::' || raw === '0.0.0.0';
  const display = wildcard ? '127.0.0.1' : raw;
  const bracketed = display.includes(':') && !display.startsWith('[') ? `[${display}]` : display;
  return `http://${bracketed}:${port}`;
}

async function pingUntilReady(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/ping`, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) return true;
    } catch {
      // Still booting, or the bind failed and the process is exiting anyway.
    }
    await new Promise(resolve => { setTimeout(resolve, 300); });
  }
  return false;
}

export async function runServe(options: ServeOptions): Promise<number> {
  const dataDir = options.dataDir
    ?? process.env.SROUTER_DATA_DIR?.trim()
    ?? path.join(os.homedir(), '.srouter');
  if (!process.env.SROUTER_DB_PATH?.trim()) {
    process.env.SROUTER_DB_PATH = path.join(dataDir, 'data', 'srouter.db');
  }
  if (!process.env.SROUTER_ENV_PATH?.trim()) {
    process.env.SROUTER_ENV_PATH = path.join(dataDir, '.env');
  }
  if (options.port !== undefined) process.env.PORT = String(options.port);
  if (options.host !== undefined) process.env.HOST = options.host;
  // The gateway derives everything writable from the DB path (sqlite file +
  // WAL siblings, .encryption-key, backups) — one directory, made here so the
  // first run on a fresh machine never fails on a missing parent.
  fs.mkdirSync(path.dirname(process.env.SROUTER_DB_PATH), { recursive: true });

  process.stdout.write(`[srouter] data directory ${dataDir}\n`);

  // Deliberately a non-literal specifier: the gateway module's top level
  // starts the server (native sqlite, sharp, the whole boot sequence), and a
  // static graph edge here would make the CLI build depend on the server's
  // declaration output.
  const gateway = '@srouter/server';
  await import(gateway);

  const port = Number(process.env.PORT ?? 20268);
  const url = dashboardUrl(options.host, port);
  if (await pingUntilReady(url, 30_000)) {
    process.stdout.write(`[srouter] dashboard ready at ${url}\n`);
    if (options.openBrowser) openBrowser(url);
    return 0;
  }
  process.stderr.write(
    `[srouter] gateway did not answer at ${url} within 30s — see the output above for the reason\n`,
  );
  return 1;
}
