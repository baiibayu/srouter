// @vitest-environment jsdom
// Keys → Web Search: eight engines in Models → Search order — DuckDuckGo and
// SearXNG as keyless status rows, the six free-tier key slots behind them —
// each writing its own field on PUT /api/settings/web-search.
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { WebSearchSection } from './web-search-section'

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

const CFG = {
  backend: 'duckduckgo',
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

function rowLabels(): string[] {
  return [...container.querySelectorAll('section .border-b > div > div:first-child > span.text-sm.font-medium')]
    .map(span => span.textContent ?? '')
}

it('orders the eight engines like Models → Search, keyless rows first', async () => {
  await mount()
  expect(rowLabels()).toEqual([
    'Web search backend', 'DuckDuckGo', 'SearXNG', 'TinyFish', 'Exa', 'Brave', 'Tavily', 'Firecrawl', 'Linkup',
  ])
  // The two keyless engines carry the green keyless badge, never an input.
  const keyless = [...container.querySelectorAll('section span')].filter(s => s.textContent === 'keyless')
  expect(keyless).toHaveLength(2)
  expect(container.querySelectorAll('input[type="password"]')).toHaveLength(6)
})

it('reports filled and empty status per key slot from the presence flags', async () => {
  await mount()
  const statusOf = (label: string) => {
    const row = [...container.querySelectorAll('section .border-b')].find(r => r.textContent?.startsWith(label))!
    return row.textContent ?? ''
  }
  expect(statusOf('TinyFish')).toContain('Key stored')
  expect(statusOf('Tavily')).toContain('Key stored')
  expect(statusOf('Brave')).toContain('No key yet')
  expect(statusOf('Firecrawl')).toContain('No key yet')
  expect(statusOf('Linkup')).toContain('No key yet')
})

it('saves each new slot to its own field on PUT /api/settings/web-search', async () => {
  await mount()
  const save = (label: string, value: string) => {
    const row = [...container.querySelectorAll('section .border-b')].find(r => r.textContent?.startsWith(label))!
    const input = row.querySelector('input[type="password"]')!
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const button = [...row.querySelectorAll('button')].find(b => b.textContent === 'Save')!
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
