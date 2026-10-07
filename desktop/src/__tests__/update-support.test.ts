import { describe, expect, it } from 'vitest';
import { updateSupport, updaterProxy } from '../update-support.js';

const base = { isPackaged: true, execPath: '/Applications/SRouter.app/Contents/MacOS/SRouter', productName: 'SRouter' };

describe('updateSupport', () => {
  it('leaves a dev build alone unless a test feed is configured', () => {
    expect(updateSupport({ ...base, isPackaged: false, platform: 'darwin' })).toEqual({ phase: 'unsupported', reason: 'dev' });
    expect(updateSupport({ ...base, isPackaged: false, platform: 'darwin', feed: 'http://127.0.0.1:8099/' })).toBeNull();
  });

  it('updates an installed mac app but not one running from the mounted dmg', () => {
    expect(updateSupport({ ...base, platform: 'darwin' })).toBeNull();
    expect(updateSupport({ ...base, platform: 'darwin', execPath: '/Volumes/SRouter/SRouter.app/Contents/MacOS/SRouter' }))
      .toEqual({ phase: 'unsupported', reason: 'package' });
  });

  it('updates the NSIS install on Windows but not the portable zip', () => {
    const execPath = 'C:\\Users\\me\\AppData\\Local\\Programs\\SRouter\\SRouter.exe';
    const installed = (file: string) => file.endsWith('Uninstall SRouter.exe');
    expect(updateSupport({ ...base, platform: 'win32', execPath }, installed)).toBeNull();
    expect(updateSupport({ ...base, platform: 'win32', execPath }, () => false)).toEqual({ phase: 'unsupported', reason: 'package' });
  });

  it('updates the AppImage on Linux and leaves deb/rpm to the package manager', () => {
    expect(updateSupport({ ...base, platform: 'linux', execPath: '/tmp/.mount_x/srouter-desktop', appImage: '/home/me/SRouter.AppImage' })).toBeNull();
    expect(updateSupport({ ...base, platform: 'linux', execPath: '/opt/SRouter/srouter-desktop' })).toEqual({ phase: 'unsupported', reason: 'package' });
  });
});

describe('updaterProxy', () => {
  it('leaves the session on system settings when no proxy is set', () => {
    expect(updaterProxy('')).toBeNull();
    expect(updaterProxy('not a url')).toBeNull();
    expect(updaterProxy('ftp://proxy:21')).toBeNull();
  });

  it('turns the app proxy into Chromium proxy rules', () => {
    expect(updaterProxy('http://127.0.0.1:7890')).toEqual({ rules: 'http://127.0.0.1:7890', username: '', password: '' });
    expect(updaterProxy('http://proxy.lan')).toEqual({ rules: 'http://proxy.lan:80', username: '', password: '' });
    expect(updaterProxy('socks5h://127.0.0.1:1080')?.rules).toBe('socks5://127.0.0.1:1080');
    expect(updaterProxy('socks4a://10.0.0.1:1080')?.rules).toBe('socks4://10.0.0.1:1080');
    expect(updaterProxy('http://[::1]:3128')?.rules).toBe('http://[::1]:3128');
  });

  it('splits the credentials off for the login event', () => {
    expect(updaterProxy('http://me:p%40ss@proxy.lan:3128')).toEqual({ rules: 'http://proxy.lan:3128', username: 'me', password: 'p@ss' });
  });
});

describe('updaterProxy', () => {
  it('leaves the session on system settings when no proxy is set', () => {
    expect(updaterProxy('')).toBeNull();
    expect(updaterProxy('not a url')).toBeNull();
    expect(updaterProxy('ftp://proxy:21')).toBeNull();
  });

  it('turns the app proxy into Chromium proxy rules', () => {
    expect(updaterProxy('http://127.0.0.1:7890')).toEqual({ rules: 'http://127.0.0.1:7890', username: '', password: '' });
    expect(updaterProxy('http://proxy.lan')).toEqual({ rules: 'http://proxy.lan:80', username: '', password: '' });
    expect(updaterProxy('socks5h://127.0.0.1:1080')?.rules).toBe('socks5://127.0.0.1:1080');
    expect(updaterProxy('socks4a://10.0.0.1:1080')?.rules).toBe('socks4://10.0.0.1:1080');
    expect(updaterProxy('http://[::1]:3128')?.rules).toBe('http://[::1]:3128');
  });

  it('splits the credentials off for the login event', () => {
    expect(updaterProxy('http://me:p%40ss@proxy.lan:3128')).toEqual({ rules: 'http://proxy.lan:3128', username: 'me', password: 'p@ss' });
  });
});
