// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import { apiFetch } from '@/lib/api'
import type { Platform } from '../../../../shared/types'
import { AddKeyForm } from './add-key-form'

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// #1331: key-optional providers (Kilo, OVH, AI Horde) keep the key field
// editable; a blank submit enables the anonymous tier, a real key is sent.
let root: Root
let container: HTMLDivElement
const onSuccess = vi.fn()

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  vi.mocked(apiFetch).mockReset().mockImplementation(async (_path: string, init?: RequestInit) =>
    init?.method === 'POST' ? { id: 1 } : [])
  onSuccess.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); container.remove() })

function mount(component: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  act(() => root.render(<QueryClientProvider client={client}><I18nProvider initialLocale="en">{component}</I18nProvider></QueryClientProvider>))
}
function keyInput() {
  return container.querySelector<HTMLInputElement>('input[type="password"]')!
}
function enter(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function submit() {
  act(() => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
}
function posted() {
  const call = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === 'POST')
  return call ? JSON.parse(String(call[1]!.body)) : undefined
}

describe.each<Platform>(['kilo', 'ovh', 'aihorde'])('adding a %s key (key optional)', platform => {
  it('keeps the key field enabled with an Optional placeholder and the Get API key link', () => {
    mount(<AddKeyForm onSuccess={onSuccess} initialPlatform={platform} />)
    expect(keyInput().disabled).toBe(false)
    expect(keyInput().placeholder).toBe('Optional')
    expect(container.querySelector('a[href^="http"]')).not.toBeNull()
  })

  it('enables the anonymous tier when the key is left blank', async () => {
    mount(<AddKeyForm onSuccess={onSuccess} initialPlatform={platform} />)
    await submit()
    expect(posted()).toEqual({ platform, key: '' })
    expect(onSuccess).toHaveBeenCalled()
  })

  it('sends a real key when one is pasted', async () => {
    mount(<AddKeyForm onSuccess={onSuccess} initialPlatform={platform} />)
    enter(keyInput(), '  my-real-key  ')
    await submit()
    expect(posted()).toEqual({ platform, key: 'my-real-key' })
  })
})

it('still requires a key for a provider that needs one', async () => {
  mount(<AddKeyForm onSuccess={onSuccess} initialPlatform="groq" />)
  await submit()
  expect(posted()).toBeUndefined()
})

// Web search/fetch engine keys are entered in the Web Tools tab only
// (components/keys/web-search-section). Offering them here as well would be a
// second place to store the same credential, so the picker lists chat, media
// and custom providers and nothing else.
async function openPicker() {
  const trigger = container.querySelector<HTMLElement>('[aria-label="Platform"]')!
  act(() => { trigger.click() })
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  return document.querySelector<HTMLElement>('[data-slot="popover-content"]')
}

it('offers no web search or fetch provider in the add-key picker', async () => {
  mount(<AddKeyForm onSuccess={onSuccess} />)
  const popup = (await openPicker())!
  const text = popup.textContent ?? ''
  for (const name of ['Tavily', 'Exa', 'Firecrawl', 'Linkup', 'Parallel']) {
    expect(text).not.toContain(name)
  }
  // The retired Search group heading and its Models sibling are both gone: a
  // single unlabelled list needs neither, and no heading is left stranded.
  expect(popup.querySelectorAll('[class*="uppercase"]')).toHaveLength(0)
  const headings = [...popup.querySelectorAll('div')]
    .map(div => div.textContent)
    .filter(text => text === 'Search' || text === 'Models')
  expect(headings).toEqual([])
  // Chat providers are still all there.
  expect(text).toContain('Groq')
  expect(text).toContain('Google AI Studio')
})

it('treats a forced search platform as an unknown provider', async () => {
  // A platform handed in through `initialPlatform` is not in the picker, so it
  // resolves to no provider entry: no search key shortcut, and the list it
  // opens is still chat/media only. (The picker, not the URL, is the single
  // home for engine credentials — Web Tools.)
  mount(<AddKeyForm onSuccess={onSuccess} initialPlatform={'tavily' as Platform} />)
  const popup = (await openPicker())!
  expect(popup.textContent).not.toContain('Tavily')
  expect(popup.textContent).toContain('Groq')
  expect(container.querySelector('a[href*="tavily"]')).toBeNull()
})
