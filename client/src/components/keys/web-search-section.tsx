import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'
import { Row, SectionHeader } from '@/components/config-rows'

// Shape of GET/PUT /api/settings/web-search (server routes/settings.ts).
// Keys are write-only: the server reports presence per slot, never the
// stored value. `backend` is gone from the API (Fase B: /v1/search walks the
// Models → Search engine list, not a hand-picked backend), so this surface
// only owns the slots those engines read.
interface WebSearchConfig {
  baseUrl: string
  hasTavilyKey: boolean
  hasBraveKey: boolean
  hasExaKey: boolean
  hasTinyfishKey: boolean
  hasFirecrawlKey: boolean
  hasLinkupKey: boolean
}

// Where each keyed backend's free tier lives (no card required for any).
// Shown as a direct link next to the key field so signup is one click away —
// the same guidance the provider checklist gives for model providers.
const KEY_SOURCES = {
  tinyfish: 'https://agent.tinyfish.ai/api-keys',
  exa: 'https://dashboard.exa.ai/',
  brave: 'https://brave.com/search/api/',
  tavily: 'https://app.tavily.com/',
  firecrawl: 'https://www.firecrawl.dev/app/api-keys',
  linkup: 'https://app.linkup.so/api-keys',
} as const

type KeyedBackend = 'tinyfish' | 'exa' | 'brave' | 'tavily' | 'firecrawl' | 'linkup'

// Labels here; the row order below follows the Models → Search engine list
// (duckduckgo, parallel, searxng, tinyfish, exa, brave, tavily, firecrawl,
// linkup) so the two pages read top-to-bottom the same way.
const KEY_LABELS: Record<KeyedBackend, string> = {
  tinyfish: 'TinyFish',
  exa: 'Exa',
  brave: 'Brave',
  tavily: 'Tavily',
  firecrawl: 'Firecrawl',
  linkup: 'Linkup',
}

function KeyField({
  backend,
  stored,
  busy,
  onSave,
}: {
  backend: KeyedBackend
  stored: boolean
  busy: boolean
  onSave: (value: string | null) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const label = KEY_LABELS[backend]

  return (
    <Row
      label={label}
      control={(
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs ${stored ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}>
            {stored ? t('keys.webSearchStored') : t('keys.webSearchNotSet')}
          </span>
          <a
            href={KEY_SOURCES[backend]}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            {t('keys.webSearchGetKey')}
            <ExternalLink className="size-3" />
          </a>
          <input
            type="password"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder={stored ? '••••••••' : t('keys.webSearchGetKey')}
            aria-label={`${label} — ${t('settings.webSearchKey')}`}
            className="h-9 w-52 rounded-lg border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <button
            type="button"
            onClick={() => {
              const trimmed = draft.trim()
              onSave(trimmed === '' ? null : trimmed)
              setDraft('')
              setSaved(true)
              setTimeout(() => setSaved(false), 1500)
            }}
            disabled={busy || (draft.trim() === '' && !stored)}
            className="h-9 shrink-0 rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saved ? t('settings.webSearchSaved') : t('common.save')}
          </button>
        </div>
      )}
    />
  )
}

// DuckDuckGo and Parallel answer with no key and no setting at all — a status
// row carrying the same keyless badge and "ready to use" note the Models →
// Search cards show.
function KeylessRow({ label }: { label: string }) {
  const { t } = useI18n()
  return (
    <Row
      label={label}
      control={(
        <div className="flex items-center gap-2">
          <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-emerald-600/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400">
            {t('search.keylessBadge')}
          </span>
          <span className="text-xs text-muted-foreground">{t('keys.webSearchKeylessReady')}</span>
        </div>
      )}
    />
  )
}

// Subsection divider used to visually separate Search keys from Fetch keys
// within the single Web Tools card.
function SubsectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="pt-6 pb-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </div>
  )
}

// Keys page → Web Tools: the single place for all web search AND fetch key
// settings. Search section: DuckDuckGo and Parallel (keyless), SearXNG
// (instance URL), then the six keyed search engines. Fetch section: Jina
// Reader (keyless fallback) and TinyFish (uses the same key as above —
// stored once, powers both search and /v1/fetch). There is no backend picker
// any more — the engine list decides which provider answers.
export function WebSearchSection() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { data: cfg } = useQuery<WebSearchConfig>({
    queryKey: ['web-search'],
    queryFn: () => apiFetch('/api/settings/web-search'),
  })
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<WebSearchConfig>('/api/settings/web-search', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['web-search'], data)
    },
  })
  const [urlDraft, setUrlDraft] = useState('')
  const [urlSaved, setUrlSaved] = useState(false)

  const [syncedUrl, setSyncedUrl] = useState<string | null>(null)
  if (cfg && cfg.baseUrl !== syncedUrl) {
    setSyncedUrl(cfg.baseUrl)
    setUrlDraft(cfg.baseUrl)
  }

  if (!cfg) return null

  return (
    <section className="rounded-3xl border bg-card p-5">
      <SectionHeader title={t('keys.webToolsSection')} description={t('keys.webSearchSectionDesc')} />
      <div className="space-y-0">
        {/* — Search engines — */}
        <SubsectionHeading
          title={t('keys.webToolsSearchSubsection')}
          description={t('keys.webToolsSearchSubsectionDesc')}
        />
        <KeylessRow label="DuckDuckGo" />
        <KeylessRow label="Parallel" />
        <Row
          label={t('keys.webSearchSearxngInstance')}
          hint={t('keys.webSearchSearxngInstanceHelp')}
          control={(
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={urlDraft}
                onChange={event => setUrlDraft(event.target.value)}
                placeholder="http://localhost:8888"
                aria-label={t('keys.webSearchSearxngInstance')}
                className="h-9 w-72 rounded-lg border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = urlDraft.trim()
                  patch.mutate({ baseUrl: trimmed === '' ? null : trimmed })
                  setUrlSaved(true)
                  setTimeout(() => setUrlSaved(false), 1500)
                }}
                disabled={patch.isPending || urlDraft.trim() === cfg.baseUrl}
                className="h-9 shrink-0 rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {urlSaved ? t('settings.webSearchSaved') : t('common.save')}
              </button>
            </div>
          )}
        />
        <KeyField
          backend="tinyfish"
          stored={cfg.hasTinyfishKey}
          busy={patch.isPending}
          onSave={value => patch.mutate({ tinyfishKey: value })}
        />
        <KeyField
          backend="exa"
          stored={cfg.hasExaKey}
          busy={patch.isPending}
          onSave={value => patch.mutate({ exaKey: value })}
        />
        <KeyField
          backend="brave"
          stored={cfg.hasBraveKey}
          busy={patch.isPending}
          onSave={value => patch.mutate({ braveKey: value })}
        />
        <KeyField
          backend="tavily"
          stored={cfg.hasTavilyKey}
          busy={patch.isPending}
          onSave={value => patch.mutate({ tavilyKey: value })}
        />
        <KeyField
          backend="firecrawl"
          stored={cfg.hasFirecrawlKey}
          busy={patch.isPending}
          onSave={value => patch.mutate({ firecrawlKey: value })}
        />
        <KeyField
          backend="linkup"
          stored={cfg.hasLinkupKey}
          busy={patch.isPending}
          onSave={value => patch.mutate({ linkupKey: value })}
        />

        {/* — Fetch engines (POST /v1/fetch) — */}
        <SubsectionHeading
          title={t('keys.webToolsFetchSubsection')}
          description={t('keys.webToolsFetchSubsectionDesc')}
        />
        {/* Jina Reader is always available with no key. TinyFish Fetch uses the
            same key as TinyFish Search above — stored once, powers both. */}
        <KeylessRow label="Jina Reader" />
        <KeyField
          backend="tinyfish"
          stored={cfg.hasTinyfishKey}
          busy={patch.isPending}
          onSave={value => patch.mutate({ tinyfishKey: value })}
        />
      </div>
    </section>
  )
}
