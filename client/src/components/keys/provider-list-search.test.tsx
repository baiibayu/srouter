// @vitest-environment jsdom
// Web search/fetch engine providers are managed exclusively via the Web Tools
// tab (WebSearchSection). They are excluded from the Providers tab to avoid
// key redundancy, which means the list never renders a Search section — for
// any input. Chat-only providers still render with their model actions, and a
// box holding nothing but engine keys gets the first-key invitation rather
// than a "no match" over rows that are deliberately hidden.
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { ProviderList } from './provider-list'
import type { ApiKey, Platform } from '../../../../shared/types'

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

const apiKey = (over: Partial<ApiKey>): ApiKey => ({
  id: 1, platform: 'groq', label: 'Prod key', maskedKey: 'gsk_…1234', baseUrl: null,
  status: 'healthy', enabled: true, keyless: false, exportable: true,
  createdAt: '2026-10-01 00:00:00', lastCheckedAt: null, lastHealthError: null, ...over,
})

let root: Root
let container: HTMLDivElement
let client: QueryClient

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); client.clear(); container.remove() })

async function flush() { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
async function mount(keys: ApiKey[]) {
  vi.mocked(apiFetch).mockReset().mockImplementation(async (path: string) => {
    if (path === '/api/keys') return keys
    if (path === '/api/health') return { platforms: [], keys: [], quotaStates: [] }
    if (path === '/api/settings/proxy') return { proxyUrl: '', enabled: false, bypassPlatforms: [], active: false }
    return {}
  })
  act(() => root.render(
    <QueryClientProvider client={client}><I18nProvider initialLocale="en"><ProviderList onAddKey={() => {}} /></I18nProvider></QueryClientProvider>
  ))
  await flush()
}

const headings = () => [...container.querySelectorAll('h2')].map(h => h.textContent)
const providers = () => [...container.querySelectorAll('h3')].map(h => h.textContent)

it('excludes search engine keys from the Providers tab (managed in Web Tools)', async () => {
  // Keys stored under search platforms (e.g. tavily) are no longer listed in
  // the Providers tab; they are managed exclusively via the Web Tools tab.
  await mount([
    apiKey({ id: 1, platform: 'groq' }),
    apiKey({ id: 2, platform: 'tavily', label: 'Search key', maskedKey: 'tvly…9999' }),
  ])
  // Only the groq chat provider should appear; tavily is excluded.
  expect(providers()).toEqual(expect.arrayContaining(['Groq']))
  expect(providers().some(p => p?.startsWith('Tavily'))).toBe(false)
  // No section headings when only chat providers are shown.
  expect(headings()).toEqual([])
})

it('renders no section heading above the provider groups', async () => {
  // The Search/Models split belonged to the old grouped layout; with engine
  // keys excluded there is only one kind of row left, so no heading is drawn.
  await mount([apiKey({ id: 1, platform: 'groq' })])
  expect(headings()).toEqual([])
})

it('hides the edit-models action on a search key', async () => {
  await mount([apiKey({ id: 2, platform: 'tavily' as Platform, label: 'Search key' })])
  expect(container.querySelector('[aria-label="Edit models"]')).toBeNull()
  // A chat key still offers it.
  act(() => root.unmount())
  root = createRoot(container)
  await mount([apiKey({ id: 1, platform: 'groq' })])
  expect(container.querySelector('[aria-label="Edit models"]')).not.toBeNull()
})

it('invites a first key when only search keys are stored', async () => {
  // Every search/fetch engine key is owned by the Web Tools tab, so a box
  // holding nothing else has no Providers row to show. Saying "no match" over
  // keys that are deliberately not listed would send the operator hunting for
  // a filter; the empty state's add button is the honest next step.
  await mount([
    apiKey({ id: 2, platform: 'tavily', label: 'Search key' }),
    apiKey({ id: 3, platform: 'exa', label: 'Second search key' }),
  ])
  expect(providers()).toEqual([])
  expect(container.textContent).toContain('No provider keys yet')
  expect(container.querySelector('button')?.textContent).toContain('Add key')
})

it('offers no search provider anywhere in the Providers toolbar', async () => {
  // The add-key form (add-key-form.test.tsx) is covered separately; here the
  // point is that the Providers tab itself carries no search-engine entry
  // point or section machinery left over from the old grouped layout.
  await mount([apiKey({ id: 1, platform: 'groq' }), apiKey({ id: 2, platform: 'tavily' })])
  const text = container.textContent ?? ''
  for (const name of ['Tavily', 'Exa', 'Firecrawl', 'Linkup', 'Parallel']) {
    expect(text).not.toContain(name)
  }
  expect(text).not.toContain('Web search keys')
})
