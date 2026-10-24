import { useQuery } from '@tanstack/react-query'
import { GitBranch, Loader2, Server } from 'lucide-react'
import { useI18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { LogoMark } from '@/components/logo-mark'
import { PLATFORMS } from '@/components/keys/shared'
import type { RoutingStrategy } from '@/lib/routing'

interface LiveRoute {
  platform: string
  model: string
  attempt: number
  requestedModel: string | null
  clientAgent?: string | null
  ageMs: number
}

interface LiveRoutes {
  active: LiveRoute[]
  last: (LiveRoute & { outcome: 'ok' | 'fail' | 'canceled'; latencyMs: number }) | null
}

const STRATEGY_TKEY: Record<RoutingStrategy, string> = {
  priority: 'manual',
  balanced: 'balanced',
  smartest: 'smartest',
  fastest: 'fastest',
  reliable: 'reliable',
  custom: 'custom',
}

const MAX_LANES = 4

const AGENT_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex',
  'cline': 'Cline',
  'roo': 'Roo Code',
  'continue': 'Continue',
  'aider': 'Aider',
  'opencode': 'OpenCode',
  'goose': 'Goose',
  'qwen-code': 'Qwen Code',
  'kilo-code': 'Kilo Code',
  'crush': 'Crush',
  'deepseek-harness': 'DeepSeek Harness',
  'mimo-code': 'MiMo Code',
  'atomcode': 'AtomCode',
  'openclaw': 'OpenClaw',
  'hermes-agent': 'Hermes Agent',
  'pi': 'Pi',
  'reasonix': 'Reasonix',
  'cursor': 'Cursor',
  'gemini-cli': 'Gemini CLI',
  'zed': 'Zed',
  'jetbrains': 'JetBrains',
  'ollama-client': 'Ollama Client',
  'openai-sdk': 'OpenAI SDK',
  'anthropic-sdk': 'Anthropic SDK',
  'unknown': 'API Client',
}

function agentLabel(agent?: string | null): string {
  if (!agent) return 'API Client'
  return AGENT_LABELS[agent] ?? agent
}

function platformLabel(platform: string): string {
  const match = PLATFORMS.find(p => p.value === platform)
  return (match?.label ?? platform).split(' (')[0]
}

function resolveModeInfo(
  requestedModel: string | null | undefined,
  strategy: RoutingStrategy,
  t: (key: string, vars?: any) => string,
): { sub: string; label: string; tone?: string } {
  if (!requestedModel || requestedModel === 'auto') {
    return {
      sub: t('routingStrip.mode'),
      label: `Auto (${t(`strategies.${STRATEGY_TKEY[strategy]}`)})`,
    }
  }

  const lower = requestedModel.toLowerCase()
  if (lower.startsWith('auto:')) {
    const axis = lower.replace(/^auto:/, '')
    return {
      sub: 'Agent Override',
      label: `Auto (${axis})`,
      tone: 'text-blue-600 dark:text-blue-400 font-medium',
    }
  }

  if (['fastest', 'smartest', 'balanced', 'priority', 'reliable'].includes(lower)) {
    return {
      sub: 'Agent Override',
      label: lower.charAt(0).toUpperCase() + lower.slice(1),
      tone: 'text-blue-600 dark:text-blue-400 font-medium',
    }
  }

  return {
    sub: 'Direct Pin',
    label: 'Bypass Router',
    tone: 'text-amber-600 dark:text-amber-400 font-medium',
  }
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
        <div className="max-w-[11rem] truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{sub}</div>
      )}
      <div className={`mt-0.5 flex items-center gap-1.5 text-xs font-medium ${tone}`}>
        {icon}
        <span className="max-w-[11rem] truncate">{label}</span>
      </div>
    </div>
  )
}

function ProviderModelNode({
  platform,
  model,
}: {
  platform: string
  model?: string | null
}) {
  return (
    <div className="min-w-0 shrink-0 rounded-xl border bg-background px-3 py-2">
      <div className="max-w-[11rem] truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {platformLabel(platform)}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs font-mono font-medium text-foreground">
        <Server className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="max-w-[11rem] truncate" title={model ?? ''}>
          {model || '—'}
        </span>
      </div>
    </div>
  )
}

function AgentStatusNode({
  agent,
  status,
  latencyMs,
  attempt,
  ageMs,
  isProcessing,
}: {
  agent?: string | null
  status?: 'ok' | 'fail' | 'canceled' | null
  latencyMs?: number | null
  attempt?: number
  ageMs?: number
  isProcessing: boolean
}) {
  const name = agentLabel(agent)

  if (isProcessing) {
    return (
      <div className="min-w-0 shrink-0 rounded-xl border bg-background px-3 py-2">
        <div className="max-w-[11rem] truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-primary">
          <span className="inline-block size-2 rounded-full bg-primary animate-pulse" />
          <span>In-flight {ageMs ? `${(ageMs / 1000).toFixed(1)}s` : ''}</span>
        </div>
      </div>
    )
  }

  if (status === 'ok') {
    return (
      <div className="min-w-0 shrink-0 rounded-xl border bg-background px-3 py-2">
        <div className="max-w-[11rem] truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <span className="inline-block size-2 rounded-full bg-emerald-500" />
          <span>200 OK {latencyMs != null ? `· ${latencyMs}ms` : ''} {attempt && attempt > 1 ? `(a${attempt})` : ''}</span>
        </div>
      </div>
    )
  }

  if (status === 'fail') {
    return (
      <div className="min-w-0 shrink-0 rounded-xl border bg-background px-3 py-2">
        <div className="max-w-[11rem] truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
          <span className="inline-block size-2 rounded-full bg-destructive" />
          <span>Failed {attempt ? `· a${attempt}` : ''}</span>
        </div>
      </div>
    )
  }

  if (status === 'canceled') {
    return (
      <div className="min-w-0 shrink-0 rounded-xl border bg-background px-3 py-2">
        <div className="max-w-[11rem] truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-muted-foreground" />
          <span>Canceled</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 shrink-0 rounded-xl border bg-background px-3 py-2">
      <div className="max-w-[11rem] truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Client
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="inline-block size-2 rounded-full bg-muted-foreground/40" />
        <span>Waiting for request…</span>
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
  const current = active[active.length - 1] ?? last
  const branching = active.length > 1
  const lanes = active.slice(0, MAX_LANES)
  const hiddenLanes = active.length - lanes.length

  const currentModeInfo = resolveModeInfo(current?.requestedModel, strategy, t)

  return (
    <section className="rounded-3xl border bg-card p-4 sm:p-5" aria-label={t('routingStrip.title')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{t('routingStrip.title')}</h2>
        {processing && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            <Loader2 className="size-3 animate-spin" />
            {t('routingStrip.activeCount', { n: active.length })}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto">
        <StripNode sub="Gateway" label="SRouter" icon={<LogoMark className="size-4 shrink-0" />} />
        <StripLine processing={processing} />

        {branching ? (
          <div className="flex min-w-0 flex-col gap-2 py-0.5 border-l-2 border-border/80 pl-3">
            {lanes.map((lane, i) => {
              const laneModeInfo = resolveModeInfo(lane.requestedModel, strategy, t)
              return (
                <div key={i} className="flex min-w-0 items-center gap-2">
                  <StripNode
                    sub={laneModeInfo.sub}
                    label={laneModeInfo.label}
                    tone={laneModeInfo.tone}
                    icon={<GitBranch className="size-3.5 shrink-0 text-muted-foreground" />}
                  />
                  <StripLine processing={true} />
                  <ProviderModelNode platform={lane.platform} model={lane.model} />
                  <StripLine processing={true} />
                  <AgentStatusNode
                    agent={lane.clientAgent}
                    ageMs={lane.ageMs}
                    isProcessing={true}
                  />
                </div>
              )
            })}
            {hiddenLanes > 0 && (
              <span className="self-start rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                +{hiddenLanes}
              </span>
            )}
          </div>
        ) : (
          <>
            <StripNode
              sub={currentModeInfo.sub}
              label={currentModeInfo.label}
              tone={currentModeInfo.tone}
              icon={<GitBranch className="size-3.5 shrink-0 text-muted-foreground" />}
            />
            <StripLine processing={processing} />
            <ProviderModelNode
              platform={current ? current.platform : '—'}
              model={current ? current.model : '—'}
            />
            <StripLine processing={processing} />
            <AgentStatusNode
              agent={current?.clientAgent}
              status={processing ? null : last?.outcome}
              latencyMs={last?.latencyMs}
              attempt={current?.attempt}
              ageMs={current?.ageMs}
              isProcessing={processing}
            />
          </>
        )}
      </div>
    </section>
  )
}
