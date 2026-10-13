import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/page-header'
import { CodeBlock } from '@/components/code-block'
import { ModelsTabs } from '@/components/models-tabs'
import { useI18n } from '@/i18n'

// Shape of GET /api/settings/web-search (server routes/settings.ts).
interface WebSearchConfig {
  backend: 'duckduckgo' | 'searxng' | 'tavily' | 'brave' | 'exa' | 'tinyfish'
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

const FETCH_CURL_EXAMPLE = `curl http://localhost:20268/v1/fetch \\
  -H "Authorization: Bearer $SROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/article"}'`

// Models → Web: the six /v1/web-search backends presented like a model list —
// one row each, the active one highlighted, with local attempt counters
// (quota burn; providers expose no "quota left" API). The picker and the
// Tavily/Brave/Exa/TinyFish keys live on the Keys page (Web search tab),
// stated here as a link rather than a second form.
export default function WebSearchPage() {
  const { t } = useI18n()
  const { data: cfg } = useQuery<WebSearchConfig>({
    queryKey: ['web-search'],
    queryFn: () => apiFetch('/api/settings/web-search'),
  })

  const active = (backend: WebSearchConfig['backend']) => cfg?.backend === backend

  // "N today · M this month", only once something was actually attempted.
  const usageText = (backend: WebSearchConfig['backend']) => {
    const daily = cfg?.usage?.daily?.[backend] ?? 0
    const monthly = cfg?.usage?.monthly?.[backend] ?? 0
    if (!daily && !monthly) return undefined
    return t('models.webSearchUsage', { daily, monthly })
  }

  const row = (options: {
    name: string
    detail?: string
    backend: WebSearchConfig['backend']
    usage?: string
  }) => (
    <div className="flex items-center gap-2 min-w-0 text-sm">
      <span
        className="size-2 rounded-sm shrink-0"
        style={{ backgroundColor: active(options.backend) ? 'rgb(34,197,94)' : 'rgb(148,163,184)' }}
      />
      <span className="truncate font-medium">{options.name}</span>
      {options.detail && (
        <span className="truncate text-muted-foreground/70 text-xs font-normal">{options.detail}</span>
      )}
      <span className="flex-1" />
      {options.usage && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">{options.usage}</span>
      )}
      <Badge variant={active(options.backend) ? 'default' : 'secondary'}>
        {active(options.backend) ? t('models.badgeActive') : t('models.badgeStandby')}
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
            {row({ name: 'DuckDuckGo', detail: 'keyless · default', backend: 'duckduckgo', usage: usageText('duckduckgo') })}
            {row({
              name: 'SearXNG',
              detail: cfg?.backend === 'searxng' && cfg.baseUrl ? cfg.baseUrl : 'keyless · own instance',
              backend: 'searxng',
              usage: usageText('searxng'),
            })}
            {row({
              name: 'Tavily',
              detail: cfg ? `${cfg.hasTavilyKey ? t('models.webSearchKeyStored') : t('models.webSearchKeyMissing')} · ${t('models.webSearchQuotaTavily')}` : undefined,
              backend: 'tavily',
              usage: usageText('tavily'),
            })}
            {row({
              name: 'Brave',
              detail: cfg ? `${cfg.hasBraveKey ? t('models.webSearchKeyStored') : t('models.webSearchKeyMissing')} · ${t('models.webSearchQuotaBrave')}` : undefined,
              backend: 'brave',
              usage: usageText('brave'),
            })}
            {row({
              name: 'Exa',
              detail: cfg ? `${cfg.hasExaKey ? t('models.webSearchKeyStored') : t('models.webSearchKeyMissing')} · ${t('models.webSearchQuotaExa')}` : undefined,
              backend: 'exa',
              usage: usageText('exa'),
            })}
            {row({
              name: 'TinyFish',
              detail: cfg ? `${cfg.hasTinyfishKey ? t('models.webSearchKeyStored') : t('models.webSearchKeyMissing')} · ${t('models.webSearchQuotaTinyfish')}` : undefined,
              backend: 'tinyfish',
              usage: usageText('tinyfish'),
            })}
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
      </div>
    </div>
  )
}
