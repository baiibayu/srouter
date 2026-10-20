// @vitest-environment jsdom
// Web Fetch card (rendered on Models → Search and Models → Web): the reader
// chain's honest status from GET /api/fetch/config, the Auto | TinyFish | Jina
// primary chooser writing PUT /api/fetch/config, the inline POST /v1/fetch
// endpoint hint (no curl block), and the /api/fetch/usage counters.
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { WebFetchCard } from './web-fetch-card'

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

interface Cfg { primary: 'auto' | 'tinyfish' | 'jina'; effective: 'tinyfish' | 'jina'; tinyfishKey: boolean }
const CFG: Cfg = { primary: 'auto', effective: 'jina', tinyfishKey: false }

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
async function mount(cfg: Cfg = CFG) {
  // The server is stateful here: a PUT sticks, so the invalidation refetch
  // returns the new config rather than the stale one.
  let current = cfg
  vi.mocked(apiFetch).mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/api/fetch/usage') return { monthly: 12, today: 3 }
    if (path === '/api/fetch/config') {
      if (init?.method === 'PUT') {
        const { primary } = JSON.parse(String(init.body)) as { primary: Cfg['primary'] }
        const effective = primary === 'jina' ? 'jina' : current.tinyfishKey ? 'tinyfish' : 'jina'
        current = { ...current, primary, effective }
      }
      return current
    }
    return {}
  })
  act(() => root.render(
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale="en"><WebFetchCard /></I18nProvider>
    </QueryClientProvider>
  ))
  await flush()
}

const button = (label: string) =>
  [...container.querySelectorAll('button')].find(b => b.textContent === label) as HTMLButtonElement | undefined

it('shows both reader-chain engines with role and their real status', async () => {
  await mount()
  const text = container.textContent ?? ''
  expect(text).toContain('TinyFish')
  expect(text).toContain('primary')
  expect(text).toContain('Jina')
  expect(text).toContain('fallback')
  // The curl block is gone, replaced by an inline endpoint hint.
  expect(text).not.toContain('curl http://localhost:20268/v1/fetch')
  expect(text).toContain('POST /v1/fetch')
  expect(text).toContain('SSRF guard')
  // Honest badge: no TinyFish key → Jina is the effective reader.
  expect(text).toContain('Jina active (anonymous, limited)')
  expect(text).not.toContain('TinyFish active')
})

it('renders the month and day fetch usage counters from GET /api/fetch/usage', async () => {
  await mount()
  expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path === '/api/fetch/usage')).toBe(true)
  expect(container.textContent).toContain('12 this month · 3 today')
})

it('disables the TinyFish option and explains the fallback when its key is missing', async () => {
  await mount({ primary: 'tinyfish', effective: 'jina', tinyfishKey: false })
  expect(button('TinyFish')!.disabled).toBe(true)
  expect(container.textContent).not.toContain('TinyFish active')
  expect(container.textContent).toContain('requests keep falling back to Jina')
})

it('writes the picked primary to PUT /api/fetch/config and refreshes config + usage', async () => {
  await mount({ primary: 'auto', effective: 'tinyfish', tinyfishKey: true })
  expect(container.textContent).toContain('TinyFish active')
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  act(() => button('Jina')!.click())
  await flush()
  const put = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === 'PUT')
  expect(put?.[0]).toBe('/api/fetch/config')
  expect(JSON.parse(String(put?.[1]?.body))).toEqual({ primary: 'jina' })
  const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey[0])
  expect(keys).toContain('fetch-config')
  expect(keys).toContain('fetch-usage')
  // The card follows the PUT response, not an optimistic guess.
  expect(container.textContent).toContain('Jina active (anonymous, limited)')
})

it('offers TinyFish once its key is stored', async () => {
  await mount({ primary: 'auto', effective: 'tinyfish', tinyfishKey: true })
  expect(button('TinyFish')!.disabled).toBe(false)
  expect(button('Auto')!.getAttribute('aria-selected')).toBe('true')
})
