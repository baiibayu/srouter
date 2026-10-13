import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'
import { Row, SectionHeader, OptionBar } from '@/components/config-rows'

// Shape of GET/PUT /api/settings/web-search (server routes/settings.ts).
// Keys are write-only: the server reports presence per backend, never the
// stored value.
interface WebSearchConfig {
  backend: 'duckduckgo' | 'searxng' | 'tavily' | 'brave' | 'exa' | 'tinyfish'
  baseUrl: string
  hasTavilyKey: boolean
  hasBraveKey: boolean
  hasExaKey: boolean
  hasTinyfishKey: boolean
}

// Where each keyed backend's free tier lives (no card required for any).
// Shown as a direct link next to the key field so signup is one click away —
// the same guidance the provider checklist gives for model providers.
const KEY_SOURCES = {
  tavily: 'https://app.tavily.com/',
  brave: 'https://brave.com/search/api/',
  exa: 'https://dashboard.exa.ai/',
  tinyfish: 'https://agent.tinyfish.ai/api-keys',
} as const

type KeyedBackend = 'tavily' | 'brave' | 'exa' | 'tinyfish'

const KEY_LABELS: Record<KeyedBackend, string> = {
  tavily: 'Tavily',
  brave: 'Brave',
  exa: 'Exa',
  tinyfish: 'TinyFish',
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

// Keys page → Providers: the /v1/web-search backend picker plus the four
// free-tier key slots (Tavily/Brave/Exa/TinyFish — TinyFish's key also feeds
// the /v1/fetch reader chain). SearXNG's instance URL lives here too — this
// is the whole "which backend answers the search" surface; the Models → Web
// tab only reports the active state.
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

  useEffect(() => {
    if (cfg) setUrlDraft(cfg.baseUrl)
  }, [cfg?.baseUrl])

  if (!cfg) return null

  return (
    <section className="rounded-3xl border bg-card p-5">
      <SectionHeader title={t('keys.webSearchSection')} description={t('keys.webSearchSectionDesc')} />
      <div className="space-y-0">
        <Row
          label={t('settings.webSearchBackend')}
          hint={t('settings.webSearchHelp')}
          control={(
            <OptionBar
              value={cfg.backend}
              onValueChange={backend => patch.mutate({ backend })}
              options={([
                { value: 'duckduckgo', label: 'DuckDuckGo' },
                { value: 'searxng', label: 'SearXNG' },
                { value: 'tavily', label: 'Tavily' },
                { value: 'brave', label: 'Brave' },
                { value: 'exa', label: 'Exa' },
                { value: 'tinyfish', label: 'TinyFish' },
              ] satisfies Array<{ value: WebSearchConfig['backend']; label: string }>)}
              ariaLabel={t('settings.webSearchBackend')}
              className="w-full grid-cols-2 sm:grid-cols-3 sm:w-96"
            />
          )}
        />
        {cfg.backend === 'searxng' && (
          <Row
            label={t('settings.webSearchSearxngUrl')}
            hint={t('settings.webSearchUrlHelp')}
            control={(
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={urlDraft}
                  onChange={event => setUrlDraft(event.target.value)}
                  placeholder="http://localhost:8888"
                  aria-label={t('settings.webSearchSearxngUrl')}
                  className="h-9 w-52 rounded-lg border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
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
        )}
        <KeyField
          backend="tavily"
          stored={cfg.hasTavilyKey}
          busy={patch.isPending}
          onSave={value => patch.mutate({ tavilyKey: value })}
        />
        <KeyField
          backend="brave"
          stored={cfg.hasBraveKey}
          busy={patch.isPending}
          onSave={value => patch.mutate({ braveKey: value })}
        />
        <KeyField
          backend="exa"
          stored={cfg.hasExaKey}
          busy={patch.isPending}
          onSave={value => patch.mutate({ exaKey: value })}
        />
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
