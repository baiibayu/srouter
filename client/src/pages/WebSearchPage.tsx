import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/page-header'
import { CodeBlock } from '@/components/code-block'
import { ModelsTabs } from '@/components/models-tabs'
import { WebFetchCard } from '@/components/web-fetch-card'
import { useI18n } from '@/i18n'
import type { SearchEngine } from '@/lib/search'

// Shape of GET /api/settings/web-search (server routes/settings.ts).
// The `backend` field no longer exists on this API: /v1/search walks the
// Models → Search engine list, so this page reports each engine's honest
// `configured` state instead of a chosen backend.
interface WebSearchConfig {
  baseUrl: string
  hasTavilyKey: boolean
  hasBraveKey: boolean
  hasExaKey: boolean
  hasTinyfishKey: boolean
  // Attempt counters per backend (server counts every try, current day/month).
  usage: { daily: Record<string, number>; monthly: Record<string, number> }
}

const CURL_EXAMPLE = `curl http://localhost:20268/v1/web-search \\
  -H "Authorization: Bearer $SROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"latest news","max_results":5}'`

// Models → Web: the /v1/web-search surface over the same engine list the
// Search tab shows — one row per engine, its honest readiness (keyless ready,
// instance URL missing, key missing) and its local attempt counters (quota
// burn; providers expose no "quota left" API). The keys and the SearXNG
// address live on the Keys page (Web search tab), stated here as a link
// rather than a second form.
export default function WebSearchPage() {
  const { t } = useI18n()
  const { data: cfg } = useQuery<WebSearchConfig>({
    queryKey: ['web-search'],
    queryFn: () => apiFetch('/api/settings/web-search'),
  })
  const { data: engines = [] } = useQuery<SearchEngine[]>({
    queryKey: ['search-engines'],
    queryFn: () => apiFetch('/api/search/engines'),
  })

  // "N today · M this month", only once something was actually attempted.
  const usageText = (platform: string) => {
    const daily = cfg?.usage?.daily?.[platform] ?? 0
    const monthly = cfg?.usage?.monthly?.[platform] ?? 0
    if (!daily && !monthly) return undefined
    return t('models.webSearchUsage', { daily, monthly })
  }

  const row = (engine: SearchEngine) => (
    <div key={engine.id} className="flex items-center gap-2 min-w-0 text-sm">
      <span
        className="size-2 rounded-sm shrink-0"
        style={{ backgroundColor: engine.configured ? 'rgb(34,197,94)' : 'rgb(245,158,11)' }}
      />
      <span className="truncate font-medium">{engine.displayName}</span>
      <span className="truncate text-muted-foreground/70 text-xs font-normal">
        {engine.platform === 'searxng' && cfg?.baseUrl ? cfg.baseUrl : engine.quotaLabel}
      </span>
      <span className="flex-1" />
      {usageText(engine.platform) && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">{usageText(engine.platform)}</span>
      )}
      <Badge variant={engine.configured ? 'default' : 'secondary'}>
        {engine.configured ? t('models.badgeActive') : t('models.badgeStandby')}
      </Badge>
    </div>
  )

  return (
    <div>
      <PageHeader title={t('models.webSearchTab')} description={t('models.webSearchBlurb')} divider={false} tabs={<ModelsTabs />} />
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">{t('keys.webSearchSection')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('keys.webSearchSectionDesc')}</p>
        </div>
        <section className="rounded-3xl border bg-card p-5">
          <div className="space-y-3.5">
            {engines.map(row)}
          </div>
          <p className="mt-4 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
            {t('models.webSearchFallback')}
          </p>
          <p className="mt-2 text-xs">
            <Link to="/keys?tab=webSearch" className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              {t('models.webSearchKeysHint')}
            </Link>
          </p>
        </section>
        <section className="rounded-3xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-medium">{t('models.webSearchExample')}</h2>
          <div className="overflow-x-auto rounded-xl border bg-muted/40 p-3">
            <CodeBlock code={CURL_EXAMPLE} language="bash" />
          </div>
        </section>
        {/* Web Fetch lives here since 2026-10-10 (merged from its own tab). */}
        <WebFetchCard />
      </div>
    </div>
  )
}
