import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'

/** GET /api/fetch/usage: POST /v1/fetch attempts this month / today. */
interface FetchUsage {
  monthly: number
  today: number
}

/**
 * GET/PUT /api/fetch/config: which reader answers first. `auto` prefers
 * TinyFish when its key is stored and falls back to the keyless Jina reader;
 * `effective` is the reader the server would actually use right now.
 */
interface FetchConfig {
  primary: 'auto' | 'tinyfish' | 'jina'
  effective: 'tinyfish' | 'jina'
  tinyfishKey: boolean
}

const dot = 'size-2 rounded-sm shrink-0'
const GREEN = 'rgb(34,197,94)'
const GREY = 'rgb(148,163,184)'

// Models → Search/Web shared card: the /v1/fetch reader chain — TinyFish when
// its account key is stored, the keyless Jina reader otherwise, SSRF-guarded.
// The primary chooser writes PUT /api/fetch/config; the badge and the engine
// rows report the effective reader, never an optimistic guess.
export function WebFetchCard() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { data: usage } = useQuery<FetchUsage>({
    queryKey: ['fetch-usage'],
    queryFn: () => apiFetch('/api/fetch/usage'),
    refetchInterval: 30_000,
  })
  const { data: cfg } = useQuery<FetchConfig>({
    queryKey: ['fetch-config'],
    queryFn: () => apiFetch('/api/fetch/config'),
  })
  const setPrimary = useMutation({
    mutationFn: (primary: FetchConfig['primary']) =>
      apiFetch<FetchConfig>('/api/fetch/config', { method: 'PUT', body: JSON.stringify({ primary }) }),
    onSuccess: (data) => {
      queryClient.setQueryData(['fetch-config'], data)
      queryClient.invalidateQueries({ queryKey: ['fetch-config'] })
      queryClient.invalidateQueries({ queryKey: ['fetch-usage'] })
    },
  })

  const tinyfish = cfg?.effective === 'tinyfish'
  // "TinyFish" chosen with no stored key: the server keeps reading through
  // Jina, and the card says why rather than pretending TinyFish is active.
  const tinyfishStarved = cfg?.primary === 'tinyfish' && !cfg.tinyfishKey

  return (
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
      <div className="mt-4 space-y-2.5 border-t border-border/60 pt-3">
        <div className="flex items-center gap-2 min-w-0 text-sm">
          <span className={dot} style={{ backgroundColor: tinyfish ? GREEN : GREY }} />
          <span className="truncate font-medium">{t('models.webFetchPrimary')}</span>
          <span className="flex-1" />
          {cfg && (
            <Badge variant={tinyfish ? 'default' : 'secondary'}>
              {tinyfish ? t('search.fetchStatusTinyfish') : t('search.fetchStatusJina')}
            </Badge>
          )}
        </div>
        {cfg && (
          <SegmentedControl
            value={cfg.primary}
            onValueChange={primary => setPrimary.mutate(primary)}
            options={([
              { value: 'auto', label: t('search.fetchPrimaryAuto') },
              { value: 'tinyfish', label: 'TinyFish', disabled: !cfg.tinyfishKey },
              { value: 'jina', label: 'Jina' },
            ] satisfies Array<{ value: FetchConfig['primary']; label: string; disabled?: boolean }>)}
            ariaLabel={t('models.webFetchPrimary')}
            className="w-full sm:w-72"
          />
        )}
        {tinyfishStarved && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">{t('search.fetchTinyfishNoKey')}</p>
        )}
        <div className="flex items-center gap-2 min-w-0 text-sm">
          <span className={dot} style={{ backgroundColor: tinyfish ? GREEN : GREY }} />
          <span className="truncate font-medium">TinyFish</span>
          <span className="truncate text-muted-foreground/70 text-xs font-normal">{t('search.rolePrimary')}</span>
          <span className="flex-1" />
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {cfg?.tinyfishKey ? t('search.fetchKeyStored') : t('search.fetchKeyMissing')}
          </span>
        </div>
        <div className="flex items-center gap-2 min-w-0 text-sm">
          <span className={dot} style={{ backgroundColor: tinyfish ? GREY : GREEN }} />
          <span className="truncate font-medium">Jina</span>
          <span className="truncate text-muted-foreground/70 text-xs font-normal">{t('search.roleFallback')}</span>
          <span className="flex-1" />
          <span className="shrink-0 text-[11px] text-muted-foreground">{t('search.fetchJinaAnon')}</span>
        </div>
        {usage?.monthly != null && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {t('search.fetchUsage', { monthly: usage.monthly, today: usage.today ?? 0 })}
          </p>
        )}
      </div>
      <ul className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
        <li>{t('models.webFetchSsrf')}</li>
        <li>{t('models.webFetchJina')}</li>
      </ul>
    </section>
  )
}
