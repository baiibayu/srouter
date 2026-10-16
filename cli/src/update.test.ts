import { afterEach, describe, expect, it, vi } from 'vitest';
import { npmCommand, resolveInstallMode, runUpdate } from './update.js';

function captureOutput(): { out: () => string; err: () => string } {
  const outWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const out = () => outWrite.mock.calls.map(call => String(call[0])).join('');
  const err = () => errWrite.mock.calls.map(call => String(call[0])).join('');
  return { out, err };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveInstallMode', () => {
  it('recognizes the npx execution cache on both platforms', () => {
    expect(resolveInstallMode({
      scriptPath: 'C:\\Users\\me\\AppData\\Local\\npm-cache\\_npx\\ab12\\node_modules\\@baiibayu\\srouter\\dist\\index.js',
    })).toBe('npx');
    expect(resolveInstallMode({
      scriptPath: '/home/me/.npm/_npx/ab12/node_modules/@baiibayu/srouter/dist/index.js',
    })).toBe('npx');
  });

  it('recognizes a global install when the entry sits under npm root -g', () => {
    // POSIX shapes resolve as absolute on every platform; Windows-style
    // literals only do so on win32, so they stay platform-guarded.
    const globalRoot = '/usr/local/lib/node_modules';
    expect(resolveInstallMode({
      scriptPath: `${globalRoot}/@baiibayu/srouter/dist/index.js`,
      globalRoot,
    })).toBe('global');
    // Sibling directory sharing a prefix must not count as global.
    expect(resolveInstallMode({
      scriptPath: '/usr/local/lib/node_modules2/pkg/dist/index.js',
      globalRoot,
    })).toBe('local');
    if (process.platform === 'win32') {
      const winRoot = 'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules';
      expect(resolveInstallMode({
        scriptPath: `${winRoot}\\@baiibayu\\srouter\\dist\\index.js`,
        globalRoot: winRoot,
      })).toBe('global');
    }
  });

  it('recognizes other package managers by their directory name', () => {
    expect(resolveInstallMode({
      scriptPath: 'C:\\Users\\me\\AppData\\Local\\pnpm\\global\\5\\node_modules\\@baiibayu\\srouter\\dist\\index.js',
    })).toBe('foreign');
    expect(resolveInstallMode({
      scriptPath: '/home/me/.bun/install/global/node_modules/@baiibayu/srouter/dist/index.js',
    })).toBe('foreign');
  });

  it('falls back to local for project installs and unresolvable entries', () => {
    expect(resolveInstallMode({
      scriptPath: 'C:\\proj\\node_modules\\@baiibayu\\srouter\\dist\\index.js',
      globalRoot: 'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules',
    })).toBe('local');
    expect(resolveInstallMode({})).toBe('local');
  });
});

describe('npmCommand', () => {
  it('adds .cmd on Windows so spawn without shell still resolves', () => {
    expect(npmCommand()).toBe(process.platform === 'win32' ? 'npm.cmd' : 'npm');
  });
});

describe('runUpdate --check', () => {
  it('reports a newer version and exits 1 without installing', async () => {
    const io = captureOutput();
    const install = vi.fn();
    const code = await runUpdate({ check: true }, {
      currentVersion: () => '0.1.3',
      fetchLatest: async () => '0.2.0',
      install,
    });
    expect(code).toBe(1);
    expect(io.out()).toContain('0.1.3 → 0.2.0 available');
    expect(io.out()).toContain("run 'srouter update'");
    expect(install).not.toHaveBeenCalled();
  });

  it('exits 0 and says up to date when the registry matches', async () => {
    const io = captureOutput();
    const code = await runUpdate({ check: true }, {
      currentVersion: () => '0.2.0',
      fetchLatest: async () => '0.2.0',
    });
    expect(code).toBe(0);
    expect(io.out()).toContain('up to date (0.2.0)');
  });

  it('exits 1 with a retry hint when the registry is unreachable', async () => {
    const io = captureOutput();
    const code = await runUpdate({ check: true }, {
      currentVersion: () => '0.1.3',
      fetchLatest: async () => null,
    });
    expect(code).toBe(1);
    expect(io.err()).toContain('could not reach the npm registry');
  });
});

describe('runUpdate install flow', () => {
  it('refuses to install an npx copy and points at a global install', async () => {
    const io = captureOutput();
    const install = vi.fn();
    const code = await runUpdate({}, {
      currentVersion: () => '0.1.3',
      scriptPath: () => 'C:\\cache\\_npx\\ab12\\node_modules\\@baiibayu\\srouter\\dist\\index.js',
      globalRoot: () => null,
      install,
    });
    expect(code).toBe(1);
    expect(io.out()).toContain('npx');
    expect(io.out()).toContain('npm install -g @baiibayu/srouter');
    expect(install).not.toHaveBeenCalled();
  });

  it('defers to the package manager that owns the copy', async () => {
    const io = captureOutput();
    const install = vi.fn();
    const code = await runUpdate({}, {
      currentVersion: () => '0.1.3',
      scriptPath: () => '/home/me/.local/share/pnpm/global/5/node_modules/@baiibayu/srouter/dist/index.js',
      globalRoot: () => '/usr/lib/node_modules',
      install,
    });
    expect(code).toBe(1);
    expect(io.out()).toContain('pnpm add -g @baiibayu/srouter@latest');
    expect(install).not.toHaveBeenCalled();
  });

  it('sends project-local copies back to the project', async () => {
    const io = captureOutput();
    const code = await runUpdate({}, {
      currentVersion: () => '0.1.3',
      scriptPath: () => 'C:\\proj\\node_modules\\@baiibayu\\srouter\\dist\\index.js',
      globalRoot: () => 'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules',
    });
    expect(code).toBe(1);
    expect(io.out()).toContain('npm install @baiibayu/srouter@latest');
  });

  it('runs the global install for a global copy and reports success', async () => {
    const io = captureOutput();
    const install = vi.fn(() => 0);
    const code = await runUpdate({}, {
      currentVersion: () => '0.1.3',
      scriptPath: () => '/usr/lib/node_modules/@baiibayu/srouter/dist/index.js',
      globalRoot: () => '/usr/lib/node_modules',
      install,
    });
    expect(code).toBe(0);
    expect(install).toHaveBeenCalledTimes(1);
    expect(io.out()).toContain('Updating @baiibayu/srouter (you have 0.1.3)');
    expect(io.out()).toContain('Updated');
  });

  it('surfaces a failed install with an EACCES hint', async () => {
    const io = captureOutput();
    const code = await runUpdate({}, {
      currentVersion: () => '0.1.3',
      scriptPath: () => '/usr/lib/node_modules/@baiibayu/srouter/dist/index.js',
      globalRoot: () => '/usr/lib/node_modules',
      install: () => null,
    });
    expect(code).toBe(1);
    expect(io.err()).toContain('npm install failed');
    expect(io.err()).toContain('EACCES');
  });

  it('propagates a nonzero npm exit code', async () => {
    const io = captureOutput();
    const code = await runUpdate({}, {
      currentVersion: () => '0.1.3',
      scriptPath: () => '/usr/lib/node_modules/@baiibayu/srouter/dist/index.js',
      globalRoot: () => '/usr/lib/node_modules',
      install: () => 7,
    });
    expect(code).toBe(7);
    expect(io.err()).toContain('(exit 7)');
  });
});
