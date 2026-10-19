import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { CodeBlock } from '@/components/code-block'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'

const FETCH_CURL_EXAMPLE = `curl http://localhost:20268/v1/fetch \\
  -H "Authorization: Bearer $SROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/article"}'`

/** GET /api/fetch/usage: POST /v1/fetch attempts this month / today. */
interface FetchUsage {
  monthly: number
  today: number
}

// The reader chain behind /v1/fetch: TinyFish answers first, Jina Reader takes
// over when it cannot. Neither needs a key of its own beyond the stored
// TinyFish account key — both are always on.
const FETCH_ENGINES: Array<{ name: string; roleKey: 'search.rolePrimary' | 'search.roleFallback' }> = [
  { name: 'TinyFish', roleKey: 'search.rolePrimary' },
  { name: 'Jina', roleKey: 'search.roleFallback' },
]

// Models → Search/Web shared card: GET-free, always-on /v1/fetch endpoint —
// public http(s) browsing via TinyFish with a Jina fallback, SSRF-guarded.
// Lives here since 2026-10-10 (merged from its own tab) and is rendered by
// both the Web page (WebSearchPage) and the Search page (SearchEnginesView).
export function WebFetchCard() {
  const { t } = useI18n()
  const { data: usage } = useQuery<FetchUsage>({
    queryKey: ['fetch-usage'],
    queryFn: () => apiFetch('/api/fetch/usage'),
    refetchInterval: 30_000,
  })
  return (
    <section className="rounded-3xl border bg-card p-5">
      <div className="mb-3">
        <h2 className="text-sm font-medium">{t('models.webFetchTab')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('models.webFetchBlurb')}</p>
      </div>
      <div className="flex items-center gap-2 min-w-0 text-sm">
        <span className="size-2 rounded-sm shrink-0" style={{ backgroundColor: 'rgb(34,197,94)' }} />
        <span className="truncate font-mono font-medium">POST /v1/fetch</span>
        <span className="truncate text-muted-foreground/70 text-xs font-normal">public http(s) · TinyFish → Jina fallback</span>
        <span className="flex-1" />
        <Badge>{t('models.webFetchAlwaysOn')}</Badge>
      </div>
      <div className="mt-4 space-y-2.5 border-t border-border/60 pt-3">
        {FETCH_ENGINES.map(engine => (
          <div key={engine.name} className="flex items-center gap-2 min-w-0 text-sm">
            <span className="size-2 rounded-sm shrink-0" style={{ backgroundColor: 'rgb(34,197,94)' }} />
            <span className="truncate font-medium">{engine.name}</span>
            <span className="truncate text-muted-foreground/70 text-xs font-normal">{t(engine.roleKey)}</span>
            <span className="flex-1" />
            <span className="shrink-0 text-[10px] rounded-full px-1.5 py-0.5 bg-emerald-600/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400">
              {t('models.webFetchAlwaysOn')}
            </span>
          </div>
        ))}
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
      <div className="mt-4 border-t border-border/60 pt-3">
        <h3 className="mb-2 text-sm font-medium">{t('models.webFetchExample')}</h3>
        <div className="overflow-x-auto rounded-xl border bg-muted/40 p-3">
          <CodeBlock code={FETCH_CURL_EXAMPLE} language="bash" />
        </div>
      </div>
    </section>
  )
}
