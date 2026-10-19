// @vitest-environment jsdom
// Web Fetch card (rendered on Models → Search and Models → Web): the reader
// chain engines with their roles and always-on status, plus the local
// /api/fetch/usage month/today counters.
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { WebFetchCard } from './web-fetch-card'

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

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
async function mount() {
  vi.mocked(apiFetch).mockReset().mockImplementation(async (path: string) =>
    path === '/api/fetch/usage' ? { monthly: 12, today: 3 } : {})
  act(() => root.render(
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale="en"><WebFetchCard /></I18nProvider>
    </QueryClientProvider>
  ))
  await flush()
}

it('shows both reader-chain engines with role and always-on status', async () => {
  await mount()
  const text = container.textContent ?? ''
  expect(text).toContain('TinyFish')
  expect(text).toContain('primary')
  expect(text).toContain('Jina')
  expect(text).toContain('fallback')
  expect(text.match(/Always on/g)!.length).toBeGreaterThanOrEqual(3)
  // The curl example and both guard bullets stay put.
  expect(text).toContain('curl http://localhost:20268/v1/fetch')
  expect(text).toContain('SSRF guard')
})

it('renders the month and day fetch usage counters from GET /api/fetch/usage', async () => {
  await mount()
  expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path === '/api/fetch/usage')).toBe(true)
  expect(container.textContent).toContain('12 this month · 3 today')
})
