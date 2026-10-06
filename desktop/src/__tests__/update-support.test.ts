import { describe, expect, it } from 'vitest';
import { updateSupport } from '../update-support.js';

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
