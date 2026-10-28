// @vitest-environment jsdom
// Keys → Web Tools (Fase B): single tab for all web search AND fetch key
// settings. Search section: DuckDuckGo, Parallel (keyless), SearXNG (address),
// then the six keyed search engines. Fetch section: Jina Reader (keyless) and
// TinyFish (same key as above — stored once, powers both search and /v1/fetch).
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { WebSearchSection } from './web-search-section'

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

const CFG = {
  baseUrl: '',
  hasTavilyKey: true,
  hasBraveKey: false,
  hasExaKey: false,
  hasTinyfishKey: true,
  hasFirecrawlKey: false,
  hasLinkupKey: false,
}

let root: Root
let container: HTMLDivElement
let client: QueryClient

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  vi.mocked(apiFetch).mockReset().mockImplementation(async (_path: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return { ...CFG, ...JSON.parse(String(init.body)) }
    return CFG
  })
})
afterEach(() => { act(() => root.unmount()); client.clear(); container.remove() })

async function flush() { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
async function mount() {
  act(() => root.render(
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale="en"><WebSearchSection /></I18nProvider>
    </QueryClientProvider>
  ))
  await flush()
}

function row(label: string): Element {
  return [...container.querySelectorAll('section .border-b')].find(r => r.textContent?.startsWith(label))!
}

it('renders search and fetch subsections with no backend picker', async () => {
  await mount()
  // No backend picker
  expect(container.querySelector('[role="radiogroup"]')).toBeNull()
  expect(container.textContent).not.toContain('Web search backend')
  // Both subsection headings present
  expect(container.textContent).toContain('Search')
  expect(container.textContent).toContain('Fetch')
})

it('marks DuckDuckGo, Parallel and Jina Reader keyless and ready without an input', async () => {
  await mount()
  for (const label of ['DuckDuckGo', 'Parallel', 'Jina Reader']) {
    const r = row(label)
    expect(r.textContent).toContain('keyless')
    expect(r.textContent).toContain('ready to use')
    expect(r.querySelector('input')).toBeNull()
  }
})

it('labels the SearXNG field as the instance address, not an API key', async () => {
  await mount()
  const r = row('SearXNG')
  const input = r.querySelector('input[type="text"]') as HTMLInputElement
  expect(input).not.toBeNull()
  expect(input.getAttribute('aria-label')).toBe('SearXNG instance address')
  expect(r.textContent).not.toContain('Key stored')
})

it('saves the SearXNG instance address to baseUrl', async () => {
  await mount()
  const input = row('SearXNG').querySelector('input[type="text"]') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, 'http://search.internal:8888')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const save = [...row('SearXNG').querySelectorAll('button')].find(b => b.textContent === 'Save')!
  act(() => save.click())
  await flush()
  const bodies = vi.mocked(apiFetch).mock.calls
    .filter(([, init]) => init?.method === 'PUT')
    .map(([, init]) => JSON.parse(String(init?.body)))
  expect(bodies).toEqual([{ baseUrl: 'http://search.internal:8888' }])
})

it('reports filled and empty status per key slot from the presence flags', async () => {
  await mount()
  expect(row('TinyFish').textContent).toContain('Key stored')
  expect(row('Tavily').textContent).toContain('Key stored')
  expect(row('Brave').textContent).toContain('No key yet')
  expect(row('Firecrawl').textContent).toContain('No key yet')
  expect(row('Linkup').textContent).toContain('No key yet')
})

it('saves each new slot to its own field on PUT /api/settings/search', async () => {
  await mount()
  const save = (label: string, value: string) => {
    const slot = row(label)
    const input = slot.querySelector('input[type="password"]')!
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const button = [...slot.querySelectorAll('button')].find(b => b.textContent === 'Save')!
    act(() => button.click())
  }
  save('Firecrawl', 'fc-test-key')
  await flush()
  save('Linkup', 'lp-test-key')
  await flush()
  const bodies = vi.mocked(apiFetch).mock.calls
    .filter(([, init]) => init?.method === 'PUT')
    .map(([, init]) => JSON.parse(String(init?.body)))
  expect(bodies).toEqual([{ firecrawlKey: 'fc-test-key' }, { linkupKey: 'lp-test-key' }])
})
