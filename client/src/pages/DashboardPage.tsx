import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Boxes,
  CircleDollarSign,
  Coins,
  Globe,
  Link2,
  Server,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'
import { PageHeader } from '@/components/page-header'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Stat, Panel } from '@/components/stat'
import { Skeleton } from '@/components/ui/skeleton'
import { GettingStarted } from '@/components/getting-started'
import { TokenUsageBar } from '@/components/token-usage-bar'
import { RoutingStrip } from '@/components/routing-strip'
import { CopyButton } from '@/components/copy-button'
import { ApiUsageBlock } from '@/components/api-usage'
import { apiBaseUrl } from '@/lib/api-base-url'
import { Button } from '@/components/ui/button'
import { formatPercent, formatTokens, platformColors, type RoutingData, type TokenUsageData } from '@/lib/routing'
import type { SearchAnalytics } from '@/lib/search'

// Response shapes consumed here are a subset of what server analytics emits
// (the full types live in AnalyticsPage; only the fields this page reads are
// restated so the dashboard does not import that route's module).
type TimeRange = '24h' | '7d' | '30d' | '90d'

interface SummaryResponse {
  totalRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  estimatedCostSavings: number
  // First request ever (lifetime, never pruned) — drives the savings
  // projection below, same as on the Analytics page.
  firstRequestAt?: string | null
}

interface ByModelRow {
  platform: string
  endpoint?: string
  modelId: string
  displayName: string
  requests: number
  totalInputTokens: number
  totalOutputTokens: number
  estimatedCost: number
}

interface ByPlatformRow {
  platform: string
  providerId: string
  endpoint?: string
  requests: number
  totalInputTokens: number
  totalOutputTokens: number
}

interface UnifiedKeyResponse {
  apiKey: string
}

const TIME_RANGES: TimeRange[] = ['24h', '7d', '30d', '90d']
const RANGE_MS: Record<TimeRange, number> = {
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
  '90d': 7_776_000_000,
}

// Same persistence as the Analytics page's toggle: one remembered window for
// both views (key mirrored from AnalyticsPage's RANGE_KEY).
const RANGE_KEY = 'analytics.range'

// Standby-monitoring cadence: the dashboard is the page users leave open to
// watch traffic, so every stats query polls on one shared clock (routing keeps
// its 15s, the live strip its 3s). Server cost is single-digit-ms SQLite
// reads per cycle; react-query pauses interval polls while the tab is hidden.
const STATS_POLL_MS = 30_000

function readStoredRange(): TimeRange {
  try {
    const v = localStorage.getItem(RANGE_KEY)
    if (v && (TIME_RANGES as string[]).includes(v)) return v as TimeRange
  } catch {
    /* private mode / disabled storage */
  }
  return '7d'
}

// SQLite stores UTC 'YYYY-MM-DD HH:MM:SS' (space separator) — the exact form
// the server's optional since/until summary params validate against.
const toSqliteUtc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

function maskKey(key?: string): string {
  if (!key) return '••••••••'
  if (key.length <= 10) return key
  return `${key.slice(0, 8)}…${key.slice(-4)}`
}

// Home: connect SRouter to an agent, the monthly budget, live routing, and the
// period's headline stats + top lists. `/` redirects here; Models stays the
// catalog table.
export default function DashboardPage() {
  const { t } = useI18n()
  const [range, setRange] = useState<TimeRange>(readStoredRange)
  // Anchor for the savings projection, captured once per mount (calling
  // Date.now() during render is impure and non-deterministic) — same pattern
  // as AnalyticsPage.
  const [now] = useState(() => Date.now())
  const updateRange = (next: TimeRange) => {
    setRange(next)
    try {
      localStorage.setItem(RANGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const { data: tokenUsage } = useQuery<TokenUsageData>({
    queryKey: ['fallback', 'token-usage'],
    queryFn: () => apiFetch('/api/fallback/token-usage'),
    refetchInterval: STATS_POLL_MS,
  })

  const { data: routing } = useQuery<RoutingData>({
    queryKey: ['fallback', 'routing'],
    queryFn: () => apiFetch('/api/fallback/routing'),
    refetchInterval: 15_000,
  })

  // Shared cache keys with AnalyticsPage: visiting both pages costs one fetch.
  const { data: summary, isPending: summaryPending } = useQuery<SummaryResponse>({
    queryKey: ['analytics', 'summary', range],
    queryFn: () => apiFetch(`/api/analytics/summary?range=${range}`),
    refetchInterval: STATS_POLL_MS,
  })

  // Twin window for the "vs previous period" deltas: the same length ending
  // where the current window starts. Computed at fetch time so a refetch keeps
  // the two windows adjacent.
  const { data: prevSummary } = useQuery<SummaryResponse>({
    queryKey: ['dashboard', 'summary-prev', range],
    queryFn: () => {
      const now = Date.now()
      const span = RANGE_MS[range]
      return apiFetch(
        `/api/analytics/summary?range=${range}&since=${encodeURIComponent(toSqliteUtc(now - 2 * span))}&until=${encodeURIComponent(toSqliteUtc(now - span))}`,
      )
    },
    refetchInterval: STATS_POLL_MS,
  })

  const { data: byModel } = useQuery<ByModelRow[]>({
    queryKey: ['analytics', 'by-model', range],
    queryFn: () => apiFetch(`/api/analytics/by-model?range=${range}`),
    refetchInterval: STATS_POLL_MS,
  })

  // Savings baseline: the last-30-days figure (shared cache key with
  // AnalyticsPage, so visiting both pages costs one fetch).
  const { data: summary30 } = useQuery<SummaryResponse>({
    queryKey: ['analytics', 'summary', '30d'],
    queryFn: () => apiFetch(`/api/analytics/summary?range=30d`),
    refetchInterval: STATS_POLL_MS,
  })

  const { data: byPlatform } = useQuery<ByPlatformRow[]>({
    queryKey: ['analytics', 'by-platform', range],
    queryFn: () => apiFetch(`/api/analytics/by-platform?range=${range}`),
    refetchInterval: STATS_POLL_MS,
  })

  const { data: keyData } = useQuery<UnifiedKeyResponse>({
    queryKey: ['unified-key'],
    queryFn: () => apiFetch('/api/settings/api-key'),
  })

  const { data: searchStats } = useQuery<SearchAnalytics>({
    queryKey: ['analytics', 'search', range],
    queryFn: () => apiFetch(`/api/analytics/search?range=${range}`),
    refetchInterval: STATS_POLL_MS,
  })

  const { data: fetchUsage } = useQuery<{ monthly: number; today: number }>({
    queryKey: ['fetch-usage'],
    queryFn: () => apiFetch('/api/fetch/usage'),
    refetchInterval: STATS_POLL_MS,
  })

  // Estimated cost for the whole window: by-model rows are unpaginated, so
  // the total sums every row (the Top-10 list below only slices the display).
  const estCost = useMemo(
    () => (byModel ?? []).reduce((sum, row) => sum + (row.estimatedCost || 0), 0),
    [byModel],
  )

  // Est. savings shares Est. cost's paid-API valuation (identical server
  // formula), so as a second window total it was a near-twin card. Mirror the
  // Analytics page instead: one stable 30-day figure — extrapolated until 30
  // days of history exist — with the window's actual amount in the hover hint.
  const actualSavings = summary?.estimatedCostSavings ?? 0
  const baseSavings = summary30?.estimatedCostSavings ?? 0
  const spanDays = (() => {
    if (!summary30?.firstRequestAt) return 30
    // SQLite stores UTC "YYYY-MM-DD HH:MM:SS"
    const first = new Date(summary30.firstRequestAt.replace(' ', 'T') + 'Z').getTime()
    const days = (now - first) / 86_400_000
    if (!Number.isFinite(days)) return 30
    return Math.min(Math.max(days, 1 / 24), 30)
  })()
  const extrapolated = spanDays < 29.5
  const savings30d = extrapolated ? baseSavings * (30 / spanDays) : baseSavings
  const rangeLabel =
    range === '24h'
      ? t('analytics.rangeLabel24h')
      : range === '7d'
        ? t('analytics.rangeLabel7d')
        : range === '30d'
          ? t('analytics.rangeLabel30d')
          : t('analytics.rangeLabel90d')
  const spanLabel =
    spanDays >= 2
      ? t('analytics.spanDays', { count: Math.round(spanDays) })
      : t('analytics.spanHours', { count: Math.max(1, Math.round(spanDays * 24)) })
  const savingsHint = extrapolated
    ? t('analytics.savingsHint', {
        actual: actualSavings.toFixed(2),
        range: rangeLabel,
        span: spanLabel,
      })
    : t('analytics.savingsHintExact', { actual: actualSavings.toFixed(2), range: rangeLabel })

  const topModels = useMemo(() => (byModel ?? []).slice(0, 10), [byModel])
  const topPlatforms = useMemo(() => (byPlatform ?? []).slice(0, 5), [byPlatform])
  // Server orders both lists by requests desc, so the first row is the max —
  // the bar-in-row scale. The share bar divides by the window total (but never
  // by less than the visible rows) so the muted remainder is "everything else".
  const topModelMax = topModels[0]?.requests ?? 0
  const platformTotal = topPlatforms.reduce((sum, row) => sum + row.requests, 0)
  const providerDenom = Math.max(summary?.totalRequests ?? 0, platformTotal)

  const strategy = routing?.strategy ?? 'balanced'
  const showBudget = !!tokenUsage && tokenUsage.totalBudget > 0
  const snippet = [
    `curl ${apiBaseUrl()}/chat/completions \\`,
    `  -H "Authorization: Bearer ${keyData?.apiKey ?? '<api-key>'}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'`,
  ].join('\n')

  // Percent change vs the previous window. No badge when the previous window
  // is empty — a percent against zero is not a number worth printing.
  const deltaSub = (current: number | undefined, previous: number | undefined): string | undefined => {
    if (current == null || previous == null || previous <= 0) return undefined
    const pct = ((current - previous) / previous) * 100
    const shown = Math.abs(pct) < 0.05 ? 0 : pct
    const arrow = shown >= 0 ? '▲' : '▼'
    return `${arrow} ${Math.abs(shown).toFixed(1)}% ${t('dashboard.vsPrevious')}`
  }

  const statSkeleton = summaryPending

  return (
    <div>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <SegmentedControl
            value={range}
            onValueChange={(v) => updateRange(v as TimeRange)}
            options={TIME_RANGES.map((r) => ({
              value: r,
              label: t(
                r === '24h'
                  ? 'analytics.range24h'
                  : r === '7d'
                    ? 'analytics.range7d'
                    : r === '30d'
                      ? 'analytics.range30d'
                      : 'analytics.range90d',
              ),
            }))}
            ariaLabel={t('dashboard.title')}
          />
        }
      />

      <div className="space-y-6">
        {/* First-run checklist: hides itself once keys + a request exist */}
        <GettingStarted />

        {/* Headline stats for the selected window; four of them carry the
            percent change against the twin window fetched above. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {statSkeleton ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[74px] rounded-3xl" />)
          ) : (
            <>
              <Stat
                icon={Activity}
                label={t('analytics.requests')}
                value={summary?.totalRequests?.toLocaleString() ?? 0}
                sub={deltaSub(summary?.totalRequests, prevSummary?.totalRequests)}
              />
              <Stat
                icon={ArrowDown}
                label={t('analytics.inputTokens')}
                value={formatTokens(summary?.totalInputTokens ?? 0)}
                sub={deltaSub(summary?.totalInputTokens, prevSummary?.totalInputTokens)}
              />
              <Stat
                icon={ArrowUp}
                label={t('analytics.outputTokens')}
                value={formatTokens(summary?.totalOutputTokens ?? 0)}
                sub={deltaSub(summary?.totalOutputTokens, prevSummary?.totalOutputTokens)}
              />
              <Stat
                icon={Coins}
                label={t('dashboard.totalTokens')}
                value={formatTokens(
                  (summary?.totalInputTokens ?? 0) + (summary?.totalOutputTokens ?? 0),
                )}
                sub={deltaSub(
                  (summary?.totalInputTokens ?? 0) + (summary?.totalOutputTokens ?? 0),
                  (prevSummary?.totalInputTokens ?? 0) + (prevSummary?.totalOutputTokens ?? 0),
                )}
              />
              <Stat icon={CircleDollarSign} label={t('dashboard.estCost')} value={`$${estCost.toFixed(2)}`} />
              <Stat
                icon={TrendingUp}
                label={t('analytics.estSavings')}
                value={`$${savings30d.toFixed(2)}`}
                hint={savingsHint}
              />
            </>
          )}
        </div>

        {/* Live routing strip — gateway → mode → provider → outcome */}
        <RoutingStrip strategy={strategy} />

        {/* Monthly token budget sits with the analysis blocks, after the
            headline numbers it qualifies. */}
        {showBudget && <TokenUsageBar data={tokenUsage} />}

        {/* Top lists: what carried the window. Server already orders both
            endpoints by requests desc; this only caps the display. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel icon={Boxes} title={t('dashboard.topModels')}>
            {!byModel ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : topModels.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('common.noData')}</p>
            ) : (
              <>
                {/* Column labels: "1.2K · 840K" alone reads as two mystery
                    numbers; the header makes the units explicit. */}
                <div className="mb-1.5 flex items-center gap-2.5 px-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span className="w-4 shrink-0" />
                  <span className="size-2 shrink-0" />
                  <span className="min-w-0 flex-1" />
                  <span className="w-16 shrink-0 text-right">{t('analytics.requests')}</span>
                  <span className="w-14 shrink-0 text-right">{t('dashboard.tokens')}</span>
                </div>
                <ol className="space-y-1.5">
                {topModels.map((row, i) => (
                  <li
                    key={`${row.platform}:${row.endpoint ?? ''}:${row.modelId}`}
                    className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-xs"
                    style={
                      topModelMax > 0
                        ? {
                            backgroundImage: `linear-gradient(to right, ${
                              platformColors[row.platform] ?? '#94a3b8'
                            }22 ${((row.requests / topModelMax) * 100).toFixed(2)}%, transparent ${(
                              (row.requests / topModelMax) *
                              100
                            ).toFixed(2)}%)`,
                          }
                        : undefined
                    }
                  >
                    <span className="w-4 shrink-0 text-right font-mono text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: platformColors[row.platform] ?? '#94a3b8' }}
                    />
                    <span className="min-w-0 flex-1 truncate" title={row.displayName}>
                      {row.displayName}
                    </span>
                    <span className="w-16 shrink-0 text-right text-muted-foreground tabular-nums">
                      {row.requests.toLocaleString()}
                    </span>
                    <span className="w-14 shrink-0 text-right text-muted-foreground tabular-nums">
                      {formatTokens(row.totalInputTokens + row.totalOutputTokens)}
                    </span>
                  </li>
                ))}
                </ol>
              </>
            )}
          </Panel>

          <Panel icon={Server} title={t('analytics.requestsByProvider')}>
            {!byPlatform ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : topPlatforms.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('common.noData')}</p>
            ) : (
              <>
                {/* Share-of-window bar: the same stacked-bar language as the
                    budget component; the list below carries the exact counts. */}
                <div
                  className="mb-3 flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-muted"
                  aria-hidden="true"
                >
                  {providerDenom > 0 &&
                    topPlatforms.map((row) => (
                      <div
                        key={row.providerId}
                        style={{
                          width: `${Math.min(100, (row.requests / providerDenom) * 100)}%`,
                          backgroundColor: platformColors[row.platform] ?? '#94a3b8',
                        }}
                      />
                    ))}
                </div>
                <div className="mb-1.5 flex items-center gap-2.5 px-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span className="w-4 shrink-0" />
                  <span className="size-2 shrink-0" />
                  <span className="min-w-0 flex-1" />
                  <span className="w-16 shrink-0 text-right">{t('analytics.requests')}</span>
                  <span className="w-14 shrink-0 text-right">{t('dashboard.tokens')}</span>
                  <span className="w-10 shrink-0 text-right">%</span>
                </div>
                <ol className="space-y-1.5">
                  {topPlatforms.map((row, i) => (
                    <li
                      key={row.providerId}
                      className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-xs"
                    >
                      <span className="w-4 shrink-0 text-right font-mono text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: platformColors[row.platform] ?? '#94a3b8' }}
                      />
                      <span className="min-w-0 flex-1 truncate" title={row.endpoint || row.platform}>
                        {row.endpoint || row.platform}
                      </span>
                      <span className="w-16 shrink-0 text-right text-muted-foreground tabular-nums">
                        {row.requests.toLocaleString()}
                      </span>
                      <span className="w-14 shrink-0 text-right text-muted-foreground tabular-nums">
                        {formatTokens(row.totalInputTokens + row.totalOutputTokens)}
                      </span>
                      <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">
                        {providerDenom > 0 ? formatPercent(row.requests / providerDenom) : '—'}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </Panel>
        </div>

        {/* Web Tools: Search and Fetch usage and health */}
        <Panel
          icon={Globe}
          title={t('keys.webToolsSection')}
          actions={
            <Link to="/keys">
              <Button variant="ghost" size="sm">
                {t('nav.keys')}
              </Button>
            </Link>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('keys.webToolsSearchSubsection')}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {searchStats?.today ?? 0} {t('search.analyticsToday').toLowerCase()}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border bg-background/50 p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">{t('analytics.requests')}</p>
                  <p className="text-base font-bold tabular-nums">{searchStats?.total ?? 0}</p>
                </div>
                <div className="rounded-xl border bg-background/50 p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">{t('analytics.successRate')}</p>
                  <p className="text-base font-bold tabular-nums">
                    {searchStats && searchStats.total > 0 ? `${Math.round(searchStats.successRate * 10) / 10}%` : '—'}
                  </p>
                </div>
                <div className="rounded-xl border bg-background/50 p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">{t('analytics.avgLatency')}</p>
                  <p className="text-base font-bold tabular-nums">
                    {searchStats && searchStats.total > 0 ? `${Math.round(searchStats.avgLatencyMs)} ms` : '—'}
                  </p>
                </div>
              </div>
              {searchStats?.byEngine && searchStats.byEngine.length > 0 && (
                <div className="pt-1 text-xs text-muted-foreground flex items-center justify-between">
                  <span>{t('search.analyticsByEngine')}:</span>
                  <span className="font-medium text-foreground">
                    {searchStats.byEngine.slice(0, 2).map((e) => `${e.displayName} (${e.count})`).join(', ')}
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('keys.webToolsFetchSubsection')}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fetchUsage?.today ?? 0} {t('search.analyticsToday').toLowerCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl border bg-background/50 p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">{t('search.analyticsToday')}</p>
                  <p className="text-base font-bold tabular-nums">{fetchUsage?.today ?? 0}</p>
                </div>
                <div className="rounded-xl border bg-background/50 p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">{t('models.usageThisMonth')}</p>
                  <p className="text-base font-bold tabular-nums">{fetchUsage?.monthly ?? 0}</p>
                </div>
              </div>
              <div className="pt-1 text-xs text-muted-foreground flex items-center justify-between">
                <span>{t('models.webFetchTab')}:</span>
                <span className="font-medium text-foreground">SSRF-Guarded · TinyFish / Jina</span>
              </div>
            </div>
          </div>
        </Panel>

        {/* Endpoint & key sit at the very bottom: the top of the page is for
            glancing (stats, routing, top lists) — this card is reference
            material you copy once, and the same material lives under Keys. */}
        <Panel
          icon={Link2}
          title={t('dashboard.connect')}
          actions={
            <Link to="/keys">
              <Button variant="ghost" size="sm">
                {t('nav.keys')}
              </Button>
            </Link>
          }
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t('dashboard.endpoint')}
                  </p>
                  <code className="block truncate font-mono text-xs">{apiBaseUrl()}</code>
                </div>
                <CopyButton text={apiBaseUrl()} className="size-7 shrink-0" label={t('common.copy')} />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t('dashboard.apiKey')}
                  </p>
                  <code className="block truncate font-mono text-xs">{maskKey(keyData?.apiKey)}</code>
                </div>
                <CopyButton
                  text={keyData?.apiKey ?? ''}
                  className="size-7 shrink-0"
                  label={t('common.copy')}
                />
              </div>
            </div>

            <ApiUsageBlock snippet={snippet} title={t('dashboard.snippet')} />
          </div>
        </Panel>
      </div>
    </div>
  )
}
