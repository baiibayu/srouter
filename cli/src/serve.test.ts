import { describe, expect, it } from 'vitest';
import { isServeFlag, parseServeFlags, resolveServe } from './serve.js';

describe('serve flag parsing', () => {
  it('defaults to opening the browser and honours --no-browser', () => {
    expect(parseServeFlags([])).toEqual({ openBrowser: true });
    expect(parseServeFlags(['--no-browser'])).toEqual({ openBrowser: false });
  });

  it('parses port, host, and data-dir with space or = syntax', () => {
    expect(parseServeFlags(['--port', '3000', '--host', '127.0.0.1', '--data-dir', 'D:/data']))
      .toEqual({ openBrowser: true, port: 3000, host: '127.0.0.1', dataDir: 'D:/data' });
    expect(parseServeFlags(['--port=4000', '--data-dir=C:/srv']))
      .toEqual({ openBrowser: true, port: 4000, dataDir: 'C:/srv' });
  });

  it('rejects an out-of-range or non-numeric port', () => {
    expect(() => parseServeFlags(['--port', '0'])).toThrow('--port must be an integer');
    expect(() => parseServeFlags(['--port', '70000'])).toThrow('--port must be an integer');
    expect(() => parseServeFlags(['--port', 'abc'])).toThrow('--port must be an integer');
  });

  it('rejects a missing value, an unknown flag, and a positional word', () => {
    expect(() => parseServeFlags(['--port'])).toThrow('--port requires a value');
    expect(() => parseServeFlags(['--port', '--host'])).toThrow('--port requires a value');
    expect(() => parseServeFlags(['--prot', '3000'])).toThrow('Unknown option: --prot');
    expect(() => parseServeFlags(['typo'])).toThrow('serve takes no positional arguments');
  });

  it('recognises serve flags for dispatch without parsing them', () => {
    expect(isServeFlag('--port')).toBe(true);
    expect(isServeFlag('--no-browser')).toBe(true);
    expect(isServeFlag('--port=9')).toBe(true);
    expect(isServeFlag('--url')).toBe(false);
    expect(isServeFlag('setup-claude')).toBe(false);
  });
});

describe('serve dispatch (resolveServe)', () => {
  it('runs the gateway for a bare invocation', () => {
    expect(resolveServe([])).toEqual({ openBrowser: true });
  });

  it('serves for the serve/start subcommands and for a leading serve flag', () => {
    expect(resolveServe(['serve', '--port', '3000']))
      .toEqual({ openBrowser: true, port: 3000 });
    expect(resolveServe(['start', '--no-browser']))
      .toEqual({ openBrowser: false });
    expect(resolveServe(['--port', '3000']))
      .toEqual({ openBrowser: true, port: 3000 });
  });

  it('leaves help to the help path, in every shape', () => {
    expect(resolveServe(['--help'])).toBeNull();
    expect(resolveServe(['serve', '-h'])).toBeNull();
    expect(resolveServe(['help'])).toBeNull();
  });

  it('leaves setup, keys, and foreign flags alone', () => {
    expect(resolveServe(['setup-claude'])).toBeNull();
    expect(resolveServe(['keys', '--help'])).toBeNull();
    expect(resolveServe(['doctor', '--timeout', '5000'])).toBeNull();
    expect(resolveServe(['--url', 'http://x'])).toBeNull();
  });
});
