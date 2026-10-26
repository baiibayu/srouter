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

const CARD_HEIGHT = 52
const CARD_GAP = 8

const NODE_BOX_CLASS =
  'h-[52px] min-w-[130px] max-w-[190px] shrink-0 rounded-xl border bg-background px-3 flex flex-col justify-center shadow-2xs select-none'

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
      className={`relative flex items-center h-[52px] min-w-8 max-w-20 flex-1 shrink-0 ${className}`}
    >
      <svg className="w-full h-4 overflow-visible">
        {/* Background track line */}
        <line
          x1="0"
          y1="8"
          x2="100%"
          y2="8"
          stroke="currentColor"
          strokeWidth="2"
          className={processing ? 'text-border/70' : 'text-border'}
        />

        {/* Animated active dash line */}
        {processing && (
          <line
            x1="0"
            y1="8"
            x2="100%"
            y2="8"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray="5 5"
            className="text-primary sr-svg-flow-path"
          />
        )}

        {/* Docking anchor dot at start (flush against preceding card) */}
        <circle
          cx="0"
          cy="8"
          r="2.5"
          className={processing ? 'fill-primary' : 'fill-border'}
        />

        {/* Docking anchor dot at end (flush against succeeding card) */}
        <circle
          cx="100%"
          cy="8"
          r="2.5"
          className={processing ? 'fill-primary' : 'fill-border'}
        />
      </svg>

      {/* Animated traveling data packet */}
      {processing && (
        <span
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 size-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]"
          style={{
            animation: 'sr-packet 1.3s cubic-bezier(0.4, 0, 0.2, 1) infinite',
          }}
        />
      )}
    </div>
  )
}

function BranchTreeConnector({
  count,
  activeMap,
  processing = false,
}: {
  count: number
  activeMap?: boolean[]
  processing?: boolean
}) {
  const totalHeight = count * CARD_HEIGHT + (count - 1) * CARD_GAP
  const yCenter = totalHeight / 2
  const svgWidth = 52

  const hasActive = activeMap ? activeMap.some(Boolean) : processing

  const paths = Array.from({ length: count }, (_, i) => {
    const yDest = i * (CARD_HEIGHT + CARD_GAP) + CARD_HEIGHT / 2
    const isBranchActive = activeMap ? !!activeMap[i] : processing
    return {
      d: `M 0 ${yCenter} C ${svgWidth * 0.45} ${yCenter}, ${svgWidth * 0.55} ${yDest}, ${svgWidth} ${yDest}`,
      key: i,
      yDest,
      isBranchActive,
    }
  })

  return (
    <div
      aria-hidden="true"
      style={{ height: `${totalHeight}px`, width: `${svgWidth}px` }}
      className="relative shrink-0"
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

        {/* Origin junction point docked at Mode card right border */}
        <circle cx={0} cy={yCenter} r={3} className={hasActive ? 'fill-primary' : 'fill-border'} />

        {paths.map(({ d, key, yDest, isBranchActive }) => (
          <g key={key}>
            {/* Background static curved branch track */}
            <path
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={isBranchActive ? 'text-border/70' : 'text-border'}
            />

            {/* Foreground animated flowing dash stream */}
            {isBranchActive && (
              <path
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeDasharray="5 5"
                className="text-primary sr-svg-flow-path"
              />
            )}

            {/* Glowing pulse particle traveling along each branch */}
            {isBranchActive && (
              <circle r="3" className="fill-primary" filter="url(#sr-branch-glow)">
                <animateMotion
                  path={d}
                  dur={`${1.2 + key * 0.15}s`}
                  repeatCount="indefinite"
                />
              </circle>
            )}

            {/* Terminal junction point docked at Provider card left border */}
            <circle
              cx={svgWidth}
              cy={yDest}
              r={2.5}
              className={isBranchActive ? 'fill-primary' : 'fill-border'}
            />
          </g>
        ))}
      </svg>
    </div>
  )
}

function GatewayNode() {
  return (
    <div className={NODE_BOX_CLASS}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none mb-1">
        Gateway
      </div>
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground leading-none">
        <LogoMark className="size-4 shrink-0" />
        <span className="font-semibold tracking-tight">SRouter</span>
        <span className="text-[10px] text-muted-foreground font-mono">20268</span>
      </div>
    </div>
  )
}

function ModeNode({
  sub,
  label,
  tone,
}: {
  sub: string
  label: string
  tone?: string
}) {
  return (
    <div className={NODE_BOX_CLASS}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none mb-1 max-w-[11rem] truncate">
        {sub}
      </div>
      <div className={`flex items-center gap-1.5 text-xs font-medium leading-none ${tone || 'text-foreground'}`}>
        <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
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
    <div className={NODE_BOX_CLASS}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none mb-1 max-w-[11rem] truncate">
        {platformLabel(platform)}
      </div>
      <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-foreground leading-none">
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

  let content: React.ReactNode

  if (isProcessing) {
    content = (
      <div className="flex items-center gap-1.5 text-xs font-medium text-primary leading-none">
        <span className="inline-block size-2 rounded-full bg-primary animate-pulse" />
        <span>In-flight {ageMs ? `${(ageMs / 1000).toFixed(1)}s` : ''}</span>
      </div>
    )
  } else if (status === 'ok') {
    content = (
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 leading-none">
        <span className="inline-block size-2 rounded-full bg-emerald-500" />
        <span>200 OK {latencyMs != null ? `· ${latencyMs}ms` : ''} {attempt && attempt > 1 ? `(a${attempt})` : ''}</span>
      </div>
    )
  } else if (status === 'fail') {
    content = (
      <div className="flex items-center gap-1.5 text-xs font-medium text-destructive leading-none">
        <span className="inline-block size-2 rounded-full bg-destructive" />
        <span>Failed {attempt ? `· a${attempt}` : ''}</span>
      </div>
    )
  } else if (status === 'canceled') {
    content = (
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground leading-none">
        <span className="inline-block size-2 rounded-full bg-muted-foreground" />
        <span>Canceled</span>
      </div>
    )
  } else {
    content = (
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground leading-none">
        <span className="inline-block size-2 rounded-full bg-muted-foreground/40" />
        <span>Waiting…</span>
      </div>
    )
  }

  return (
    <div className={NODE_BOX_CLASS}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none mb-1 max-w-[11rem] truncate">
        {name}
      </div>
      {content}
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
        <div className="flex items-center gap-2">
          {hiddenLanes > 0 && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
              +{hiddenLanes} more
            </span>
          )}
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
      </div>

      <div className="flex items-center overflow-x-auto w-full py-1">
        {isBranching && modeGroups.length === 1 ? (
          /* Single shared mode: Gateway connects to Mode, Mode branches into Provider lanes */
          <>
            <GatewayNode />
            <StripLine processing={processing} />
            <div className="flex min-w-0 flex-1 items-center">
              <ModeNode
                sub={modeGroups[0].modeInfo.sub}
                label={modeGroups[0].modeInfo.label}
                tone={modeGroups[0].modeInfo.tone}
              />
              <BranchTreeConnector
                count={modeGroups[0].lanes.length}
                activeMap={modeGroups[0].lanes.map(isLaneActive)}
                processing={processing}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {modeGroups[0].lanes.map((lane, i) => (
                  <div key={i} className="flex min-w-0 flex-1 items-center">
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
            </div>
          </>
        ) : isBranching && modeGroups.length > 1 ? (
          /* Multiple different modes active: Gateway branches directly to Mode groups */
          <>
            <GatewayNode />
            <BranchTreeConnector
              count={modeGroups.length}
              activeMap={modeGroups.map(g => g.lanes.some(isLaneActive))}
              processing={processing}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {modeGroups.map((group, gi) => (
                <div key={gi} className="flex min-w-0 flex-1 items-center">
                  <ModeNode
                    sub={group.modeInfo.sub}
                    label={group.modeInfo.label}
                    tone={group.modeInfo.tone}
                  />
                  {group.lanes.length > 1 ? (
                    <>
                      <BranchTreeConnector
                        count={group.lanes.length}
                        activeMap={group.lanes.map(isLaneActive)}
                        processing={processing}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {group.lanes.map((lane, li) => (
                          <div key={li} className="flex min-w-0 flex-1 items-center">
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
            </div>
          </>
        ) : (
          /* Single request or idle */
          <>
            <GatewayNode />
            <StripLine processing={processing} />
            <ModeNode
              sub={currentModeInfo.sub}
              label={currentModeInfo.label}
              tone={currentModeInfo.tone}
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
