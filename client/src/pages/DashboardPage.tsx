import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Boxes,
  CircleDollarSign,
  Coins,
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
import { ApiUsageBlock, apiBaseUrl } from '@/components/api-usage'
import { Button } from '@/components/ui/button'
import { formatTokens, platformColors, type RoutingData, type TokenUsageData } from '@/lib/routing'

// Response shapes consumed here are a subset of what server analytics emits
// (the full types live in AnalyticsPage; only the fields this page reads are
// restated so the dashboard does not import that route's module).
type TimeRange = '24h' | '7d' | '30d' | '90d'

interface SummaryResponse {
  totalRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  estimatedCostSavings: number
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
  })

  const { data: byModel } = useQuery<ByModelRow[]>({
    queryKey: ['analytics', 'by-model', range],
    queryFn: () => apiFetch(`/api/analytics/by-model?range=${range}`),
  })

  const { data: byPlatform } = useQuery<ByPlatformRow[]>({
    queryKey: ['analytics', 'by-platform', range],
    queryFn: () => apiFetch(`/api/analytics/by-platform?range=${range}`),
  })

  const { data: keyData } = useQuery<UnifiedKeyResponse>({
    queryKey: ['unified-key'],
    queryFn: () => apiFetch('/api/settings/api-key'),
  })

  // Estimated cost for the whole window: by-model rows are unpaginated, so
  // the total sums every row (the Top-10 list below only slices the display).
  const estCost = useMemo(
    () => (byModel ?? []).reduce((sum, row) => sum + (row.estimatedCost || 0), 0),
    [byModel],
  )

  const topModels = useMemo(() => (byModel ?? []).slice(0, 10), [byModel])
  const topPlatforms = useMemo(() => (byPlatform ?? []).slice(0, 5), [byPlatform])

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
        {/* Connect (left) + monthly budget (right). On installs without a
            configured budget the connect card spans the full width. */}
        <div className={`grid gap-6 items-start ${showBudget ? 'lg:grid-cols-2' : ''}`}>
          <div className="space-y-6">
            {/* First-run checklist: hides itself once keys + a request exist */}
            <GettingStarted />

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

                <ApiUsageBlock snippet={snippet} title={t('dashboard.snippet')} />
              </div>
            </Panel>
          </div>

          {showBudget && <TokenUsageBar data={tokenUsage} />}
        </div>

        {/* Live routing strip — gateway → mode → provider → outcome */}
        <RoutingStrip strategy={strategy} />

        {/* Headline stats for the selected window; four of them carry the
            percent change against the twin window fetched above. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
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
                value={`$${(summary?.estimatedCostSavings ?? 0).toFixed(2)}`}
              />
            </>
          )}
        </div>

        {/* Top lists: what carried the window. Server already orders both
            endpoints by requests desc; this only caps the display. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel icon={Boxes} title={t('dashboard.topModels')}>
            {!byModel ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : topModels.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('common.noData')}</p>
            ) : (
              <ol className="space-y-1.5">
                {topModels.map((row, i) => (
                  <li
                    key={`${row.platform}:${row.endpoint ?? ''}:${row.modelId}`}
                    className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-xs"
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
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {row.requests.toLocaleString()} · {formatTokens(row.totalInputTokens + row.totalOutputTokens)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel icon={Server} title={t('analytics.requestsByProvider')}>
            {!byPlatform ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : topPlatforms.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('common.noData')}</p>
            ) : (
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
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {row.requests.toLocaleString()} · {formatTokens(row.totalInputTokens + row.totalOutputTokens)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
