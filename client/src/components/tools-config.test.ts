import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The web-search surface moved to the Keys page (web-search-section) and the
// Models → System One / Web Search / Web Fetch info tabs; this keeps their
// literal t() keys resolvable the same way settings-dialog.test.ts does for
// the dialog.
const here = path.dirname(fileURLToPath(import.meta.url))
const sources = [
  'tools-config.tsx',
  'keys/web-search-section.tsx',
  '../pages/SystemOnePage.tsx',
].map(name => readFileSync(path.join(here, name), 'utf8'))
const en = JSON.parse(readFileSync(path.join(here, '../i18n/locales/en.json'), 'utf8')) as unknown

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>(
    (value, part) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined),
    en,
  )
}

describe('tools config i18n', () => {
  it('resolves every literal t() key against en.json', () => {
    const keys = sources.flatMap(source => [...source.matchAll(/\bt\('([^']+)'\)/g)].map(match => match[1]))
    expect(keys.length).toBeGreaterThan(5)
    for (const key of keys) {
      expect(typeof lookup(key), `missing translation for ${key}`).toBe('string')
    }
  })
})
