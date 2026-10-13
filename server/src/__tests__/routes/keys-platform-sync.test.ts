import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// keys.ts mempertahankan daftar PLATFORMS sendiri karena z.enum(zod) butuh
// literal tuple, sedangkan shared/providers/platforms.ts mengekspor
// PlatformEntry[]. Agar daftar itu tidak pernah menyimpang dari katalog
// bersama (satu-satunya sumber kebenaran daftar provider), test ini memaksa
// keduanya identik: katalog + 'custom' (endpoint khusus user, tanpa signup URL).
const repoRoot = path.resolve(__dirname, '../../../..');

function catalogSlugs(): string[] {
  const src = fs.readFileSync(path.join(repoRoot, 'shared/providers/platforms.ts'), 'utf8');
  return [...src.matchAll(/value:\s*'([\w-]+)'/g)].map((m) => m[1]).sort();
}

function keysRouteSlugs(): string[] {
  const src = fs.readFileSync(path.join(repoRoot, 'server/src/routes/keys.ts'), 'utf8');
  const start = src.indexOf('const PLATFORMS = [');
  expect(start, 'keys.ts PLATFORMS array not found').toBeGreaterThan(-1);
  const end = src.indexOf('] as const', start);
  expect(end, 'keys.ts PLATFORMS array terminator not found').toBeGreaterThan(start);
  return [...src.slice(start, end).matchAll(/'([\w-]+)'/g)].map((m) => m[1]).sort();
}

describe('provider platform sync', () => {
  it('keys.ts PLATFORMS === shared catalog + custom', () => {
    expect(keysRouteSlugs()).toEqual([...catalogSlugs(), 'custom'].sort());
  });

  it('catalog has no duplicate slugs', () => {
    const slugs = catalogSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
