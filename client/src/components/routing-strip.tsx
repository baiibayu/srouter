import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, CircleSlash, CircleX, GitBranch, Loader2, RefreshCw, Server } from 'lucide-react'
import { useI18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { LogoMark } from '@/components/logo-mark'
import { PLATFORMS } from '@/components/keys/shared'
import type { RoutingStrategy } from '@/lib/routing'

// Live routing strip on the home page: [SRouter] → [mode] → [provider] →
// [outcome]. The connector lines march (CSS-only, .sr-flow-line) while a
// request is in flight; when the router is idle the strip shows the last
// decision instead. Data comes from GET /api/analytics/live — an in-memory
// tracker fed by the server's route traces — polled at the same cadence as the
// penalty inspector. No new dependency, no websocket: a 3s poll is plenty for
// a visualization and costs one in-memory read server-side.

interface LiveRoute {
  platform: string
  model: string
  attempt: number
  requestedModel: string | null
  ageMs: number
}

interface LiveRoutes {
  active: LiveRoute[]
  last: (LiveRoute & { outcome: 'ok' | 'fail' | 'canceled'; latencyMs: number }) | null
}

// Strategy id → the i18n suffix under `strategies.*` (Manual's id is
// 'priority' — same mapping the pills on this page use).
const STRATEGY_TKEY: Record<RoutingStrategy, string> = {
  priority: 'manual',
  balanced: 'balanced',
  smartest: 'smartest',
  fastest: 'fastest',
  reliable: 'reliable',
  custom: 'custom',
}

/** Platform slug → display name. Catalog labels carry pricing parentheses
 *  ("Groq (free …)") that would blow up the node, so the suffix is dropped. */
function platformLabel(platform: string): string {
  const match = PLATFORMS.find(p => p.value === platform)
  return (match?.label ?? platform).split(' (')[0]
}

function StripLine({ processing }: { processing: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-0.5 min-w-5 flex-1 rounded-full ${processing ? 'sr-flow-line text-primary' : 'bg-border'}`}
    />
  )
}

function StripNode({
  sub,
  icon,
  label,
  tone = 'text-foreground',
}: {
  sub?: string
  icon?: React.ReactNode
  label: React.ReactNode
  tone?: string
}) {
  return (
    <div className="min-w-0 shrink-0 rounded-xl border bg-background px-3 py-2">
      {sub && (
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{sub}</div>
      )}
      <div className={`mt-0.5 flex items-center gap-1.5 text-sm font-medium ${tone}`}>
        {icon}
        <span className="max-w-[10rem] truncate">{label}</span>
      </div>
    </div>
  )
}

export function RoutingStrip({ strategy }: { strategy: RoutingStrategy }) {
  const { t } = useI18n()
  const { data } = useQuery<LiveRoutes>({
    queryKey: ['analytics', 'live'],
    queryFn: () => apiFetch('/api/analytics/live'),
    refetchInterval: 3000,
  })

  const active = data?.active ?? []
  const last = data?.last ?? null
  const processing = active.length > 0
  // While in flight the provider node follows the newest attempt's pick; once
  // idle it falls back to what the last request was served by.
  const current = active[active.length - 1] ?? last

  const outcome = processing ? (
    <StripNode
      label={t('routingStrip.processing')}
      tone="text-primary"
      icon={<Loader2 className="size-4 shrink-0 animate-spin" />}
    />
  ) : last && last.outcome === 'ok' && last.attempt > 1 ? (
    <StripNode
      label={t('routingStrip.afterAttempts', { n: last.attempt })}
      tone="text-emerald-600 dark:text-emerald-400"
      icon={<RefreshCw className="size-4 shrink-0" />}
    />
  ) : last && last.outcome === 'ok' ? (
    <StripNode
      label={t('common.success')}
      tone="text-emerald-600 dark:text-emerald-400"
      icon={<CheckCircle2 className="size-4 shrink-0" />}
    />
  ) : last && last.outcome === 'canceled' ? (
    <StripNode
      label={t('routingStrip.canceled')}
      tone="text-muted-foreground"
      icon={<CircleSlash className="size-4 shrink-0" />}
    />
  ) : last ? (
    <StripNode
      label={t('routingStrip.failed')}
      tone="text-destructive"
      icon={<CircleX className="size-4 shrink-0" />}
    />
  ) : (
    <StripNode
      label={t('routingStrip.idle')}
      tone="text-muted-foreground"
      icon={<Circle className="size-4 shrink-0" />}
    />
  )

  return (
    <section className="rounded-3xl border bg-card p-4 sm:p-5" aria-label={t('routingStrip.title')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{t('routingStrip.title')}</h2>
        {processing && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            <Loader2 className="size-3 animate-spin" />
            {t('routingStrip.activeCount', { n: active.length })}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto">
        <StripNode label="SRouter" icon={<LogoMark className="size-4 shrink-0" />} />
        <StripLine processing={processing} />
        <StripNode
          sub={t('routingStrip.mode')}
          label={t(`strategies.${STRATEGY_TKEY[strategy]}`)}
          icon={<GitBranch className="size-4 shrink-0 text-muted-foreground" />}
        />
        <StripLine processing={processing} />
        <StripNode
          sub={t('common.provider')}
          label={current ? platformLabel(current.platform) : '—'}
          icon={<Server className="size-4 shrink-0 text-muted-foreground" />}
        />
        <StripLine processing={processing} />
        {outcome}
      </div>
    </section>
  )
}
