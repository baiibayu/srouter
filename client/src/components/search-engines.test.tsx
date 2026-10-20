// @vitest-environment jsdom
// #1174 / Fase B: Models → Search lists the catalog's search engines in
// failover order, marks the first enabled one as default, and reports each
// card's honest status from the server's `configured` flag — keyless engines
// ready, SearXNG waiting on its instance URL, keyed engines either ready or
// badged "no key" with a link to the Keys page. keyCount is not consulted.
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import { apiFetch } from '@/lib/api'
import type { SearchEngine } from '@/lib/search'
import { SearchEnginesView } from './search-engines'

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

const engine = (over: Partial<SearchEngine>): SearchEngine => ({
  id: 1, platform: 'tavily', engineId: 'tavily-search', displayName: 'Tavily', priority: 0,
  enabled: true, quotaLabel: '1,000 credits/month', creditsPerQuery: 1, features: null,
  premiumSince: null, keyless: false, configured: true, keyCount: 1, healthyKeyCount: 1,
  searchesThisMonth: 0, ...over,
})

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
async function mount(engines: SearchEngine[]) {
  vi.mocked(apiFetch).mockReset().mockImplementation(async (path: string) => {
    if (path === '/api/search/engines') return engines
    if (path === '/api/fetch/usage') return { monthly: 0, today: 0 }
    if (path === '/api/fetch/config') return { primary: 'auto', effective: 'jina', tinyfishKey: false }
    if (path.startsWith('/api/analytics/search')) return { total: 0, today: 3, successRate: 100, avgLatencyMs: 0, byEngine: [], series: [] }
    return {}
  })
  act(() => root.render(
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale="en">
        <MemoryRouter><SearchEnginesView /></MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>
  ))
  await flush()
}

it('lists engines in priority order and marks the first enabled one as default', async () => {
  await mount([
    engine({ id: 2, platform: 'exa', engineId: 'exa-search', displayName: 'Exa', priority: 1, searchesThisMonth: 12 }),
    engine({ id: 1, searchesThisMonth: 40 }),
  ])
  const names = [...container.querySelectorAll('section span.font-mono')]
    .map(s => s.textContent)
    .filter(text => text?.endsWith('-search'))
  expect(names).toEqual(['tavily-search', 'exa-search'])
  expect(container.textContent).toContain('Default')
  // The month card sums the engine rows; today comes from the analytics call.
  expect(container.textContent).toContain('52 req this month')
  expect(container.textContent).toContain('3 req today')
})

const cardOf = (engineId: string) =>
  [...container.querySelectorAll('section')].find(section => section.textContent?.includes(engineId))!

it('badges a keyless engine as keyless and says it is ready', async () => {
  await mount([
    engine({ id: 5, platform: 'duckduckgo', engineId: 'duckduckgo-search', displayName: 'DuckDuckGo', keyless: true, configured: true, keyCount: 0 }),
  ])
  const card = cardOf('duckduckgo-search')
  expect(card.textContent).toContain('keyless')
  expect(card.textContent).toContain('ready to use')
  expect(card.textContent).not.toContain('no key')
})

it('tracks the configured flag, not the key pool, for a keyed engine', async () => {
  // A populated pool is no longer what makes an engine "ready": the settings
  // key is, so configured=false still shows the no-key badge.
  await mount([engine({ id: 3, platform: 'firecrawl', engineId: 'firecrawl-search', displayName: 'Firecrawl', configured: false, keyCount: 4 })])
  const card = cardOf('firecrawl-search')
  expect(card.textContent).toContain('no key')
  expect(card.textContent).toContain('add a key')
  expect(card.querySelector('a[href="/keys?tab=webSearch"]')).not.toBeNull()
  expect(card.textContent).not.toContain('keyless')
})

it('drops the no-key badge once a keyed engine is configured', async () => {
  await mount([engine({ id: 4, platform: 'exa', engineId: 'exa-search', displayName: 'Exa', configured: true, keyCount: 0 })])
  const card = cardOf('exa-search')
  expect(card.textContent).not.toContain('no key')
  expect(card.textContent).not.toContain('keyless')
})

it('tells SearXNG apart by whether its instance URL is stored', async () => {
  await mount([
    engine({ id: 6, platform: 'searxng', engineId: 'searxng-search', displayName: 'SearXNG', keyless: true, configured: false, keyCount: 0 }),
    engine({ id: 7, platform: 'parallel', engineId: 'parallel-search', displayName: 'Parallel', keyless: true, configured: true, keyCount: 0, priority: 1 }),
  ])
  const searxng = cardOf('searxng-search')
  expect(searxng.textContent).toContain('keyless')
  expect(searxng.textContent).toContain('instance URL not set')
  const parallel = cardOf('parallel-search')
  expect(parallel.textContent).toContain('ready to use')
})

it('shows a connected SearXNG once the instance URL is stored', async () => {
  await mount([engine({ id: 6, platform: 'searxng', engineId: 'searxng-search', displayName: 'SearXNG', keyless: true, configured: true, keyCount: 0 })])
  const card = cardOf('searxng-search')
  expect(card.textContent).toContain('keyless')
  expect(card.textContent).toContain('connected')
  expect(card.textContent).not.toContain('instance URL not set')
})

it('promotes an engine to default with priority 0', async () => {
  await mount([engine({ id: 1 }), engine({ id: 2, platform: 'exa', engineId: 'exa-search', displayName: 'Exa', priority: 1 })])
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === 'Make default')!
  act(() => { button.click() })
  await flush()
  const patch = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === 'PATCH')
  expect(patch?.[0]).toBe('/api/search/engines/2')
  expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ priority: 0 })
})

it('shows the empty state before the catalog carries any engine', async () => {
  await mount([])
  expect(container.textContent).toContain('No search engines yet')
})
