import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// keys.ts maintains its own PLATFORMS literal because z.enum() requires a
// const tuple; shared/providers/platforms.ts is the single source of truth
// for the provider DISPLAY list. Together they must be consistent, except
// for search-only platforms that SRouter hosts in keys.ts and registers in
// server/src/providers/ but does not yet expose in shared — tavily/exa/
// firecrawl/linkup/parallel (the web-search engine family, #1465) plus
// the legacy keyless search platforms that pre-date the catalog migration
// and are deliberately omitted from shared until catalog sync covers them.
const repoRoot = path.resolve(__dirname, '../../../..');

// SRouter-specific platforms that live in keys.ts but NOT in shared —
// either because they are search-only engines (registered in providers/
// and handled by isSearchPlatform) or because they were added to keys.ts
// after the initial shared migration. If one of these is retired, remove
// it here and in server/src/lib/search-platforms.ts as appropriate.
const SRONLY_SLUGS = [
  // Web search engines (#1465): registered in server/src/providers/ but
  // not yet part of shared/providers/platforms.ts (catalog sync handles them).
  'tavily', 'exa', 'firecrawl', 'linkup', 'parallel',
  // OpenCode Free tier — the catalog lists it but keys.ts does not (it is
  // routed through the opencode-free.ts provider, not the standard key path).
  'opencode-free',
];

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
  return [...new Set([...src.slice(start, end).matchAll(/'([\w-]+)'/g)].map((m) => m[1]))].sort();
}

describe('provider platform sync', () => {
  it('keys.ts PLATFORMS ⊇ shared catalog + custom', () => {
    const keys = new Set(keysRouteSlugs());
    // opencode-free is listed in shared/providers/platforms.ts but is NOT
    // in keys.ts — it is routed through the opencode-free.ts provider
    // rather than the standard key path, so it is exempt from ⊇.
    const catalog = catalogSlugs().filter(s => s !== 'opencode-free');
    for (const slug of [...catalog, 'custom']) {
      expect(keys).toContain(slug);
    }
  });

  it('non-SRouter-slots keys ⊆ shared catalog + custom', () => {
    // Any slug in keys.ts that is NOT one of the SRouter-specific search
    // platforms MUST appear in the shared catalog (plus 'custom'). This
    // catches drift where a new provider is registered in keys.ts without
    // also appearing in shared/providers/platforms.ts.
    const sronly = new Set(SRONLY_SLUGS);
    const keys = keysRouteSlugs().filter(s => !sronly.has(s));
    const catalog = new Set(catalogSlugs());
    const diff = keys.filter(s => s !== 'custom' && !catalog.has(s));
    expect(diff, `keys.ts has platforms not in shared catalog: ${diff.join(', ')}`).toEqual([]);
  });

  it('catalog has no duplicate slugs', () => {
    const slugs = catalogSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});