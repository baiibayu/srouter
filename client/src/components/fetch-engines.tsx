import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'
import { UsageSummaryCard } from '@/components/usage-summary-card'

/**
 * GET /api/fetch/sources: the reader registry behind POST /v1/fetch, the
 * counterpart of GET /api/search/engines. `configured` is what can answer
 * right now; `authKind` says what a source needs — nothing ('none'), a
 * provider key ('key') or the operator's own base URL ('instance').
 */
export interface FetchSource {
  id: string
  platform: string
  name: string
  quotaLabel: string
  priority: number
  enabled: boolean
  configured: boolean
  authKind: 'none' | 'key' | 'instance'
}

export interface FetchSources {
  /** Legacy `primary` hint: auto | tinyfish | jina. */
  preferred: 'auto' | 'tinyfish' | 'jina'
  /**
   * Month/day reads for the whole chain. services/fetch-usage.ts counts each
   * fetch once, before a reader is chosen, so this is a box total and not the
   * sum of per-reader numbers — the usage card says as much instead of
   * splitting it.
   */
  usage: { monthly: number; today: number }
  sources: FetchSource[]
}

const pill = 'text-[10px] rounded-full px-1.5 py-0.5 bg-muted text-muted-foreground'
const keylessPill = 'text-[10px] rounded-full px-1.5 py-0.5 bg-emerald-600/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400'
const warnPill = 'text-[10px] rounded-full px-1.5 py-0.5 bg-amber-600/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400'

// The same status language as the search engine cards (components/search-engines):
// - a source that needs nothing is badged keyless and "ready to use";
// - a keyed source without its key gets the amber no-key badge plus the link
//   to the Keys page section that stores it, and no badge at all once stored;
// - a source backed by the operator's own URL shows its instance state
//   ("needs instance URL, then enable" → "connected"), the SearXNG pattern.
function SourceStatus({ source: s }: { source: FetchSource }) {
  const { t } = useI18n()
  if (s.authKind === 'instance') {
    return s.configured
      ? <span className="text-[11px] text-emerald-700 dark:text-emerald-400">{t('search.statusConnected')}</span>
      : <span className="text-[11px] text-amber-700 dark:text-amber-400">{t('search.fetchStatusInstanceNeeded')}</span>
  }
  if (s.authKind === 'none') {
    return (
      <>
        <span className={keylessPill}>{t('search.keylessBadge')}</span>
        <span className="text-[11px] text-muted-foreground">{t('search.statusReady')}</span>
      </>
    )
  }
  if (!s.configured) {
    return (
      <>
        <span className={warnPill}>{t('models.noKey')}</span>
        <Link
          to="/keys?tab=webSearch"
          className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t('search.addKeyCta')}
        </Link>
      </>
    )
  }
  return null
}

// One reader from the registry. Its position in the fallback order is shown as
// a number; the first enabled source is the preferred one, and any other can be
// promoted to it in one click (the legacy PUT /api/fetch/config contract).
function FetchSourceCard({
  source,
  position,
  preferred,
  onPrefer,
  canPrefer,
  pending,
}: {
  source: FetchSource
  position: number | null
  preferred: boolean
  onPrefer: () => void
  canPrefer: boolean
  pending: boolean
}) {
  const { t } = useI18n()
  return (
    <section className={`rounded-3xl border bg-card p-5 ${source.enabled ? '' : 'opacity-60'}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium">{source.id}</span>
        {/* Neutral quota pill: the reader's own published allowance, verbatim
            from the server row (seeded from the vendor's docs). */}
        <span className={pill}>{source.quotaLabel}</span>
        {preferred
          ? <span className="text-xs text-muted-foreground">{t('search.default')}</span>
          : source.enabled && canPrefer && (
            <button
              type="button"
              onClick={onPrefer}
              disabled={pending}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            >
              {t('search.makeDefault')}
            </button>
          )}
        <span className="flex-1" />
      </div>

      <div className="flex items-center gap-3">
        <span className="w-4 text-center text-xs text-muted-foreground tabular-nums">{position ?? '–'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{source.name}</span>
            <SourceStatus source={source} />
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {source.platform}
          </div>
        </div>
      </div>
    </section>
  )
}

// Models → Search/Web shared card: the /v1/fetch readers as a registry, one row
// per source with the pill system the search engines use. Which reader answers
// is decided server-side (TinyFish once its key is stored, the keyless Jina
// reader otherwise); "Make default" is the legacy PUT /api/fetch/config hint.
export function FetchEngines() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { data } = useQuery<FetchSources>({
    queryKey: ['fetch-sources'],
    queryFn: () => apiFetch('/api/fetch/sources'),
    refetchInterval: 30_000,
  })
  const setPrimary = useMutation({
    mutationFn: (primary: FetchSources['preferred']) =>
      apiFetch('/api/fetch/config', { method: 'PUT', body: JSON.stringify({ primary }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fetch-sources'] })
      queryClient.invalidateQueries({ queryKey: ['fetch-usage'] })
    },
  })

  const sources = data?.sources ?? []
  // The chain, as services/fetch-sources.ts walks it: an explicit pin wins only
  // when that reader can answer (a pin to a reader with no key cannot make it
  // answer), otherwise the first configured source answers. Mirrored here so
  // "Default" and position 1 name the reader that actually runs, never an
  // optimistic guess. Disabled rows are listed last, the way the engine cards
  // dim them instead of hiding them.
  const enabled = sources.filter(s => s.enabled)
  const pinned = data && data.preferred !== 'auto'
    ? enabled.find(s => s.platform === data.preferred)
    : undefined
  const effective = pinned && (pinned.configured || pinned.platform === 'jina')
    ? pinned
    : (enabled.find(s => s.configured) ?? enabled[0])
  const chain = [
    ...(effective ? [effective] : []),
    ...enabled.filter(s => s.id !== effective?.id),
    ...sources.filter(s => !s.enabled),
  ]
  const positions = new Map(chain.filter(s => s.enabled).map((s, i) => [s.id, i + 1]))
  // Only the two ids the legacy PUT /api/fetch/config accepts can be pinned.
  const PINNABLE = new Set(['tinyfish', 'jina'])

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border bg-card p-5">
        <div className="mb-3">
          <h2 className="text-sm font-medium">{t('models.webFetchTab')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('models.webFetchBlurb')}</p>
        </div>
        <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
          {t('search.fetchEndpointHint')}{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">POST /v1/fetch</code>{' '}
          {t('search.fetchEndpointHintTail')}
        </p>
        <ul className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
          <li>{t('models.webFetchSsrf')}</li>
          <li>{t('models.webFetchJina')}</li>
        </ul>
      </section>

      {/* The same month-to-date card the search engines and media tabs use.
          services/fetch-usage.ts tallies reads for the box as a whole — the
          reader chain never says which reader answered — so each row carries
          the reader's published quota and no invented share: the number column
          stays an em dash rather than splitting a total nobody measured. */}
      {sources.length > 0 && (
        <UsageSummaryCard
          unit="requests"
          total={data?.usage.monthly ?? 0}
          requestsToday={data?.usage.today ?? 0}
          rows={sources.map(source => ({
            label: source.name,
            platform: source.platform,
            quotaLabel: source.quotaLabel,
            amount: null,
            requestsToday: 0,
          }))}
        />
      )}

      {data && sources.length === 0 && (
        <section className="rounded-3xl border bg-card p-5">
          <p className="text-xs text-muted-foreground">{t('search.fetchEmpty')}</p>
        </section>
      )}

      {chain.map(source => (
        <FetchSourceCard
          key={source.id}
          source={source}
          position={positions.get(source.id) ?? null}
          preferred={effective?.id === source.id}
          onPrefer={() => setPrimary.mutate(source.platform as FetchSources['preferred'])}
          canPrefer={PINNABLE.has(source.platform)}
          pending={setPrimary.isPending}
        />
      ))}
    </div>
  )
}
