// @vitest-environment jsdom
// Models → Search/Web: the /v1/fetch reader registry (GET /api/fetch/sources)
// rendered with the same pill system as the search engine cards. Status is
// driven by the server's `authKind` + `configured`, never guessed client-side:
//   - 'none'     → green keyless pill, "ready to use"
//   - 'key'      → amber "no key" + link to Keys while unconfigured, no badge
//                  at all once the key is stored
//   - 'instance' → the SearXNG pattern ("needs instance URL, then enable" →
//                  "connected")
// "Make default" is the legacy PUT /api/fetch/config contract.
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { FetchEngines, type FetchSource, type FetchSources } from './fetch-engines'

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

const tinyfish: FetchSource = {
  id: 'tinyfish-fetch', platform: 'tinyfish', name: 'TinyFish Fetch',
  quotaLabel: 'free 1,000 URLs/day · 150 URLs/min', priority: 0,
  enabled: true, configured: false, authKind: 'key',
}
const jina: FetchSource = {
  id: 'jina-reader', platform: 'jina', name: 'Jina Reader',
  quotaLabel: 'keyless · 20 RPM without a key', priority: 1,
  enabled: true, configured: true, authKind: 'none',
}

let root: Root
let container: HTMLDivElement
let client: QueryClient

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); client.clear(); container.remove() })

async function flush() { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }

async function mount(sources: FetchSource[], over: Partial<FetchSources> = {}) {
  // Stateful like the server: a PUT sticks, so the invalidation refetch returns
  // the new preference instead of the stale one.
  let current: FetchSources = { preferred: 'auto', usage: { monthly: 12, today: 3 }, sources, ...over }
  vi.mocked(apiFetch).mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/api/fetch/sources') return current
    if (path === '/api/fetch/config' && init?.method === 'PUT') {
      const { primary } = JSON.parse(String(init.body)) as { primary: FetchSources['preferred'] }
      current = { ...current, preferred: primary }
      return { primary, effective: primary === 'tinyfish' ? 'tinyfish' : 'jina', tinyfishKey: primary === 'tinyfish' }
    }
    return {}
  })
  act(() => root.render(
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale="en">
        <MemoryRouter><FetchEngines /></MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>
  ))
  await flush()
}

const cardOf = (id: string) =>
  [...container.querySelectorAll('section')].find(section => section.textContent?.includes(id))!

it('lists the readers in order with the endpoint hint and no curl block', async () => {
  await mount([tinyfish, jina])
  const ids = [...container.querySelectorAll('section span.font-mono')].map(s => s.textContent)
  expect(ids).toContain('tinyfish-fetch')
  expect(ids).toContain('jina-reader')
  const text = container.textContent ?? ''
  expect(text).toContain('POST /v1/fetch')
  expect(text).not.toContain('curl http://localhost:20268/v1/fetch')
  expect(text).toContain('SSRF guard')
})

it('renders the fetch usage as the same monthly card the search engines use', async () => {
  await mount([tinyfish, jina])
  expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path === '/api/fetch/sources')).toBe(true)

  const card = cardOf('Monthly usage')
  expect(card.textContent).toContain('Monthly usage')
  // The box total, in the search card's wording — not the retired one-line text.
  expect(card.textContent).toContain('12 req this month')
  expect(card.textContent).toContain('3 req today')
  expect(card.textContent).not.toContain('12 this month · 3 today')

  // One row per reader, carrying its own published quota.
  expect(card.textContent).toContain('TinyFish Fetch')
  expect(card.textContent).toContain('free 1,000 URLs/day · 150 URLs/min')
  expect(card.textContent).toContain('Jina Reader')
  expect(card.textContent).toContain('keyless · 20 RPM without a key')

  // The server tallies the box, never a reader's share: no invented per-source
  // number — the amount column stays an em dash on every row.
  const amounts = [...card.querySelectorAll('.font-mono')].map(n => n.textContent)
  expect(amounts.length).toBeGreaterThanOrEqual(2)
  expect(amounts.every(text => text === '—')).toBe(true)
  expect(card.textContent).not.toContain('6 ')

  // Each reader gets its own swatch colour, not the shared fallback.
  const swatches = [...card.querySelectorAll('span.size-2')].map(s => s.getAttribute('style') ?? '')
  expect(swatches).toHaveLength(2)
  expect(new Set(swatches).size).toBe(2)

  // With no per-source split to draw, the bar stays a plain track instead of
  // inventing a distribution; the em dash carries the explanation.
  expect(card.querySelector('div.flex.h-2\\.5.rounded-full')).toBeNull()
  expect(card.querySelector('div.h-2\\.5.rounded-full.bg-muted')).not.toBeNull()
  expect(card.querySelector('[title]')?.getAttribute('title'))
    .toBe('Counted for the whole endpoint — per-reader totals are not recorded.')
})

it('draws the empty usage card before the first fetch of the month', async () => {
  await mount([tinyfish, jina], { usage: { monthly: 0, today: 0 } })
  const card = cardOf('Monthly usage')
  expect(card.textContent).toContain('0 req this month')
  expect(card.textContent).toContain('No requests yet this month.')
  // The track renders even at zero, as in the search card.
  expect(card.querySelector('div.h-2\\.5.rounded-full.bg-muted')).not.toBeNull()
})

it('badges the keyless reader green and calls it ready', async () => {
  await mount([tinyfish, jina])
  const card = cardOf('jina-reader')
  expect(card.textContent).toContain('keyless')
  expect(card.textContent).toContain('ready to use')
  expect(card.textContent).not.toContain('no key')
})

it('badges a keyed reader without its key and links to the Keys page', async () => {
  await mount([tinyfish, jina])
  const card = cardOf('tinyfish-fetch')
  expect(card.textContent).toContain('no key')
  expect(card.textContent).toContain('add a key')
  expect(card.querySelector('a[href="/keys?tab=webSearch"]')).not.toBeNull()
  expect(card.textContent).not.toContain('keyless')
  // The quota is the reader's own allowance, not the search engine's.
  expect(card.textContent).toContain('free 1,000 URLs/day')
  expect(card.textContent).not.toContain('12,000')
  // Printed once per card, as the neutral pill — never repeated on the meta line.
  expect(card.textContent!.split('free 1,000 URLs/day').length - 1).toBe(1)
})

it('drops every status badge once the keyed reader is configured', async () => {
  await mount([{ ...tinyfish, configured: true }, jina])
  const card = cardOf('tinyfish-fetch')
  expect(card.textContent).not.toContain('no key')
  expect(card.textContent).not.toContain('keyless')
  expect(card.querySelector('a[href="/keys?tab=webSearch"]')).toBeNull()
})

it('follows the SearXNG pattern for a source backed by the operator instance', async () => {
  const own: FetchSource = {
    id: 'own-reader', platform: 'custom', name: 'Own Reader',
    quotaLabel: 'self-hosted', priority: 2, enabled: true, configured: false, authKind: 'instance',
  }
  await mount([tinyfish, jina, own])
  const card = cardOf('own-reader')
  expect(card.textContent).toContain('needs instance URL, then enable')
  expect(card.textContent).not.toContain('keyless')
  expect(card.textContent).not.toContain('no key')
})

it('shows a connected own-instance source once its URL is stored', async () => {
  const own: FetchSource = {
    id: 'own-reader', platform: 'custom', name: 'Own Reader',
    quotaLabel: 'self-hosted', priority: 2, enabled: true, configured: true, authKind: 'instance',
  }
  await mount([jina, own])
  const card = cardOf('own-reader')
  expect(card.textContent).toContain('connected')
  expect(card.textContent).not.toContain('needs instance URL, then enable')
})

it('marks the preferred reader and promotes another through PUT /api/fetch/config', async () => {
  // Auto preference with no TinyFish key → the keyless reader is what answers.
  await mount([tinyfish, jina])
  expect(cardOf('jina-reader').textContent).toContain('Default')
  expect(cardOf('tinyfish-fetch').textContent).not.toContain('Default')

  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const promote = [...cardOf('tinyfish-fetch').querySelectorAll('button')]
    .find(b => b.textContent === 'Make default')!
  act(() => { promote.click() })
  await flush()
  const put = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === 'PUT')
  expect(put?.[0]).toBe('/api/fetch/config')
  expect(JSON.parse(String(put?.[1]?.body))).toEqual({ primary: 'tinyfish' })
  const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey[0])
  expect(keys).toContain('fetch-sources')
  expect(keys).toContain('fetch-usage')
  // A pin to a reader with no key cannot make it answer: the chain still
  // starts at Jina, and the card says so instead of pretending otherwise.
  expect(cardOf('jina-reader').textContent).toContain('Default')
  expect(cardOf('tinyfish-fetch').textContent).not.toContain('Default')
})

it('moves the default to a pinned reader once it can answer', async () => {
  await mount([{ ...tinyfish, configured: true }, jina], { preferred: 'jina' })
  expect(cardOf('jina-reader').textContent).toContain('Default')

  const promote = [...cardOf('tinyfish-fetch').querySelectorAll('button')]
    .find(b => b.textContent === 'Make default')!
  act(() => { promote.click() })
  await flush()
  // The card follows the PUT response, not an optimistic guess.
  expect(cardOf('tinyfish-fetch').textContent).toContain('Default')
  expect(cardOf('jina-reader').textContent).not.toContain('Default')
})

it('honours an explicit primary from the server', async () => {
  await mount([tinyfish, { ...jina, configured: true }], { preferred: 'jina' })
  expect(cardOf('jina-reader').textContent).toContain('Default')
  expect(cardOf('tinyfish-fetch').textContent).not.toContain('Default')
})

it('says so when the registry has no sources at all', async () => {
  await mount([])
  expect(container.textContent).toContain('No fetch sources yet')
})
