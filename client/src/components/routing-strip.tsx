import { useMemo } from 'react'
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
  outcome?: 'ok' | 'fail' | 'canceled'
  latencyMs?: number
}

interface LiveRoutes {
  active: LiveRoute[]
  last: (LiveRoute & { outcome: 'ok' | 'fail' | 'canceled'; latencyMs: number }) | null
  recent?: (LiveRoute & { outcome: 'ok' | 'fail' | 'canceled'; latencyMs: number })[]
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
  'openclaude': 'OpenClaude',
  'zcode': 'Zcode',
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
  if (AGENT_LABELS[agent]) return AGENT_LABELS[agent]

  const lower = agent.toLowerCase()
  if (/claude[- ]?code|\bclaude-cli\b/.test(lower)) return 'Claude Code'
  if (/openclaude/.test(lower)) return 'OpenClaude'
  if (/zcode/.test(lower)) return 'Zcode'
  if (/opencode/.test(lower)) return 'OpenCode'
  if (/codex/.test(lower)) return 'Codex'
  if (/cursor/.test(lower)) return 'Cursor'
  if (/cline/.test(lower)) return 'Cline'
  if (/roo/.test(lower)) return 'Roo Code'
  if (/aider/.test(lower)) return 'Aider'
  if (/continue/.test(lower)) return 'Continue'
  if (/kilo/.test(lower)) return 'Kilo Code'
  if (/crush/.test(lower)) return 'Crush'
  if (/deepseek/.test(lower)) return 'DeepSeek Harness'
  if (/mimo/.test(lower)) return 'MiMo Code'
  if (/zed/.test(lower)) return 'Zed'
  if (/vscode/.test(lower)) return 'VS Code'
  if (/intellij|pycharm|webstorm|jetbrains/.test(lower)) return 'JetBrains'
  if (/curl/.test(lower)) return 'cURL'
  if (/python/.test(lower)) return 'Python SDK'
  if (/node/.test(lower)) return 'Node.js'
  if (/openai/.test(lower)) return 'OpenAI SDK'
  if (/anthropic/.test(lower)) return 'Anthropic SDK'

  const clean = agent.split('/')[0].trim()
  if (clean && clean.length <= 16 && !['mozilla', 'http'].includes(clean.toLowerCase())) {
    return clean
  }

  return 'API Client'
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

const CARD_HEIGHT = 54
const CARD_GAP = 8

function StripLine({
  processing,
  className = '',
}: {
  processing: boolean
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={`relative flex items-center h-7 min-w-8 flex-1 max-w-28 shrink-0 ${className}`}
    >
      <svg
        viewBox="0 0 64 20"
        preserveAspectRatio="none"
        className="w-full h-5 overflow-visible"
      >
        <defs>
          <filter id="sr-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Anchor point start */}
        <circle cx={0} cy={10} r={2.5} className={processing ? 'fill-primary' : 'fill-border'} />

        {/* Background track with gentle wave curve */}
        <path
          d="M 0 10 C 20 2, 44 18, 64 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={processing ? 'text-border/80' : 'text-border'}
          vectorEffect="non-scaling-stroke"
        />

        {processing && (
          <>
            {/* Animated flowing wave dashed line */}
            <path
              d="M 0 10 C 20 2, 44 18, 64 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray="5 5"
              className="text-primary sr-svg-flow-path"
              vectorEffect="non-scaling-stroke"
            />
            {/* Glowing particle packet traveling along the wave */}
            <circle r="3" className="fill-primary" filter="url(#sr-glow)">
              <animateMotion
                path="M 0 10 C 20 2, 44 18, 64 10"
                dur="1.3s"
                repeatCount="indefinite"
              />
            </circle>
          </>
        )}

        {/* Anchor point end */}
        <circle cx={64} cy={10} r={2.5} className={processing ? 'fill-primary' : 'fill-border'} />
      </svg>
    </div>
  )
}

function BranchTreeConnector({
  count,
  processing = true,
}: {
  count: number
  processing?: boolean
}) {
  const totalHeight = count * CARD_HEIGHT + (count - 1) * CARD_GAP
  const yCenter = totalHeight / 2
  const svgWidth = 56

  const paths = Array.from({ length: count }, (_, i) => {
    const yDest = i * (CARD_HEIGHT + CARD_GAP) + CARD_HEIGHT / 2
    return {
      d: `M 0 ${yCenter} C ${svgWidth * 0.45} ${yCenter}, ${svgWidth * 0.55} ${yDest}, ${svgWidth} ${yDest}`,
      key: i,
    }
  })

  return (
    <div
      aria-hidden="true"
      style={{ height: `${totalHeight}px`, width: `${svgWidth}px` }}
      className="relative flex items-center shrink-0 my-0.5"
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${totalHeight}`}
        className="w-full h-full overflow-visible"
      >
        <defs>
          <filter id="sr-branch-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Origin junction point at the Mode card */}
        <circle cx={0} cy={yCenter} r={3} className={processing ? 'fill-primary' : 'fill-border'} />

        {paths.map(({ d, key }) => (
          <g key={key}>
            {/* Background static curved branch track */}
            <path
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={processing ? 'text-border/80' : 'text-border'}
            />
            {processing && (
              <>
                {/* Foreground animated flowing dash stream */}
                <path
                  d={d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeDasharray="6 6"
                  className="text-primary sr-svg-flow-path"
                />
                {/* Glowing pulse particle traveling along each branch */}
                <circle r="3" className="fill-primary" filter="url(#sr-branch-glow)">
                  <animateMotion
                    path={d}
                    dur={`${1.2 + key * 0.15}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              </>
            )}
            {/* Terminal junction point entering the Provider card */}
            <circle
              cx={svgWidth}
              cy={key * (CARD_HEIGHT + CARD_GAP) + CARD_HEIGHT / 2}
              r={2.5}
              className={processing ? 'fill-primary' : 'fill-border'}
            />
          </g>
        ))}
      </svg>
    </div>
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

interface ModeGroup {
  modeKey: string
  modeInfo: { sub: string; label: string; tone?: string }
  lanes: LiveRoute[]
}

export function RoutingStrip({ strategy }: { strategy: RoutingStrategy }) {
  const { t } = useI18n()
  const { data } = useQuery<LiveRoutes>({
    queryKey: ['analytics', 'live'],
    queryFn: () => apiFetch('/api/analytics/live'),
    refetchInterval: 3000,
  })

  const active = data?.active ?? []
  const recent = data?.recent ?? []
  const last = data?.last ?? null
  const processing = active.length > 0

  // Combine active lanes with recent completed lanes so completed requests
  // don't vanish immediately, but stay visible for up to 20 seconds!
  const displayedLanes = useMemo<LiveRoute[]>(() => {
    if (active.length > 0) {
      const activeIds = new Set(active.map(a => `${a.platform}:${a.model}:${a.attempt}`))
      const combined: LiveRoute[] = [...active]
      for (const r of recent) {
        if (combined.length >= MAX_LANES) break
        if (r.outcome === 'ok' && !activeIds.has(`${r.platform}:${r.model}:${r.attempt}`)) {
          combined.push(r)
        }
      }
      return combined.slice(0, MAX_LANES)
    }

    if (recent.length > 0) {
      const okRoutes = recent.filter(r => r.outcome === 'ok')
      if (okRoutes.length > 0) return okRoutes.slice(0, MAX_LANES)
      return recent.slice(0, MAX_LANES)
    }

    if (last) {
      return [last]
    }

    return []
  }, [active, recent, last])

  const lanes = displayedLanes
  const hiddenLanes = (active.length > 0 ? active.length : recent.length) - lanes.length
  const current = lanes[lanes.length - 1] ?? last
  const isBranching = lanes.length > 1
  const isLaneActive = (lane: LiveRoute) => !lane.outcome && processing

  const modeGroups = useMemo<ModeGroup[]>(() => {
    const map = new Map<string, ModeGroup>()
    for (const lane of lanes) {
      const info = resolveModeInfo(lane.requestedModel, strategy, t)
      const key = `${info.sub}:::${info.label}`
      if (!map.has(key)) {
        map.set(key, { modeKey: key, modeInfo: info, lanes: [] })
      }
      map.get(key)!.lanes.push(lane)
    }
    return Array.from(map.values())
  }, [lanes, strategy, t])

  const currentModeInfo = resolveModeInfo(current?.requestedModel, strategy, t)

  return (
    <section className="rounded-3xl border bg-card p-4 sm:p-5" aria-label={t('routingStrip.title')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{t('routingStrip.title')}</h2>
        {processing ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            <Loader2 className="size-3 animate-spin" />
            {t('routingStrip.activeCount', { n: active.length })}
          </span>
        ) : recent.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {recent.length} recent
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto w-full py-1">
        <StripNode label="SRouter" icon={<LogoMark className="size-4 shrink-0" />} />
        <StripLine processing={processing} />

        {isBranching && modeGroups.length === 1 ? (
          /* Single shared mode: branch directly to provider lanes */
          <div className="flex min-w-0 items-center gap-2">
            <StripNode
              sub={modeGroups[0].modeInfo.sub}
              label={modeGroups[0].modeInfo.label}
              tone={modeGroups[0].modeInfo.tone}
              icon={<GitBranch className="size-3.5 shrink-0 text-muted-foreground" />}
            />
            <BranchTreeConnector count={modeGroups[0].lanes.length} processing={processing} />
            <div className="flex min-w-0 flex-col gap-2 py-0.5">
              {modeGroups[0].lanes.map((lane, i) => (
                <div key={i} className="flex min-w-0 items-center gap-2">
                  <ProviderModelNode platform={lane.platform} model={lane.model} />
                  <StripLine processing={isLaneActive(lane)} />
                  <AgentStatusNode
                    agent={lane.clientAgent}
                    status={isLaneActive(lane) ? null : (lane.outcome ?? 'ok')}
                    latencyMs={lane.latencyMs}
                    attempt={lane.attempt}
                    ageMs={lane.ageMs}
                    isProcessing={isLaneActive(lane)}
                  />
                </div>
              ))}
              {hiddenLanes > 0 && (
                <span className="self-start rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                  +{hiddenLanes}
                </span>
              )}
            </div>
          </div>
        ) : isBranching && modeGroups.length > 1 ? (
          /* Multiple different modes active */
          <div className="flex min-w-0 items-center gap-2">
            <BranchTreeConnector count={modeGroups.length} processing={processing} />
            <div className="flex min-w-0 flex-col gap-2 py-0.5">
              {modeGroups.map((group, gi) => (
                <div key={gi} className="flex min-w-0 items-center gap-2">
                  <StripNode
                    sub={group.modeInfo.sub}
                    label={group.modeInfo.label}
                    tone={group.modeInfo.tone}
                    icon={<GitBranch className="size-3.5 shrink-0 text-muted-foreground" />}
                  />
                  {group.lanes.length > 1 ? (
                    <>
                      <BranchTreeConnector count={group.lanes.length} processing={processing} />
                      <div className="flex min-w-0 flex-col gap-2 py-0.5">
                        {group.lanes.map((lane, li) => (
                          <div key={li} className="flex min-w-0 items-center gap-2">
                            <ProviderModelNode platform={lane.platform} model={lane.model} />
                            <StripLine processing={isLaneActive(lane)} />
                            <AgentStatusNode
                              agent={lane.clientAgent}
                              status={isLaneActive(lane) ? null : (lane.outcome ?? 'ok')}
                              latencyMs={lane.latencyMs}
                              attempt={lane.attempt}
                              ageMs={lane.ageMs}
                              isProcessing={isLaneActive(lane)}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <StripLine processing={isLaneActive(group.lanes[0]!)} />
                      <ProviderModelNode platform={group.lanes[0]!.platform} model={group.lanes[0]!.model} />
                      <StripLine processing={isLaneActive(group.lanes[0]!)} />
                      <AgentStatusNode
                        agent={group.lanes[0]!.clientAgent}
                        status={isLaneActive(group.lanes[0]!) ? null : (group.lanes[0]!.outcome ?? 'ok')}
                        latencyMs={group.lanes[0]!.latencyMs}
                        attempt={group.lanes[0]!.attempt}
                        ageMs={group.lanes[0]!.ageMs}
                        isProcessing={isLaneActive(group.lanes[0]!)}
                      />
                    </>
                  )}
                </div>
              ))}
              {hiddenLanes > 0 && (
                <span className="self-start rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                  +{hiddenLanes}
                </span>
              )}
            </div>
          </div>
        ) : (
          /* Single request or idle */
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
              status={processing ? null : (current?.outcome ?? last?.outcome)}
              latencyMs={current?.latencyMs ?? last?.latencyMs}
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
