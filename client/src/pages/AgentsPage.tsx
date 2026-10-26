import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronRight, Globe } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'
import { PageHeader } from '@/components/page-header'
import { CopyButton } from '@/components/copy-button'
import { AgentIcon } from '@/components/agent-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import toolCatalog from '@/data/agent-tools.json'

interface ClientAnalytics {
  clientAgent: string
  requests: number
  lastSeenAt: string | null
}

interface KeyResponse {
  apiKey: string
}

interface AgentDetectionItem {
  id: string
  installed: boolean
  configured: boolean
  configPath: string | null
}

const analyticsIds: Record<string, string> = {
  claude: 'claude-code',
  codex: 'codex',
  cline: 'cline',
  continue: 'continue',
  aider: 'aider',
  opencode: 'opencode',
  goose: 'goose',
  qwen: 'qwen-code',
  roo: 'roo',
  kilo: 'kilo-code',
  crush: 'crush',
  dsh: 'deepseek-harness',
  mimo: 'mimo-code',
  omp: 'omp',
  openclaw: 'openclaw',
  hermes: 'hermes-agent',
  pi: 'pi',

  droid: 'droid',
  reasonix: 'reasonix',
  cursor: 'cursor',
}

// Agents whose built-in web search tool the gateway serves from the search
// keys (#1174): Claude Code's WebSearch and Codex's web_search.
const WEB_SEARCH_TOOL_KEYS: Record<string, string> = {
  claude: 'search.agentsBadgeClaude',
  codex: 'search.agentsBadgeCodex',
}

function masked(value: string): string {
  if (value.length < 12) return '••••••••'
  return `${value.slice(0, 8)}${'•'.repeat(12)}${value.slice(-4)}`
}

export default function AgentsPage() {
  const { t } = useI18n()
  const [revealKey, setRevealKey] = useState(false)
  const { data: keyData } = useQuery<KeyResponse>({
    queryKey: ['api-key'],
    queryFn: () => apiFetch('/api/settings/api-key'),
  })
  const { data: byClient = [] } = useQuery<ClientAnalytics[]>({
    queryKey: ['analytics', 'by-client', '30d'],
    queryFn: () => apiFetch('/api/analytics/by-client?range=30d'),
  })
  const { data: detectionData } = useQuery<{ agents: AgentDetectionItem[] }>({
    queryKey: ['agents', 'detection'],
    queryFn: () => apiFetch('/api/agents/detection'),
  })
  // "Seen recently" means traffic within the last 7 days, not merely any row
  // in the fetched 30-day window. Read once at mount via lazy state init —
  // react-hooks/purity disallows Date.now() directly in render, and a cutoff
  // that froze per re-render would only make the answer less stable anyway.
  const [seenCutoff] = useState(() => Date.now() - 7 * 24 * 60 * 60 * 1000)
  const seen = new Map(byClient
    .filter(row => row.lastSeenAt && Date.parse(row.lastSeenAt) >= seenCutoff)
    .map(row => [row.clientAgent, row]))
  const origin = import.meta.env.DEV
    ? `http://${window.location.hostname}:${__SERVER_PORT__}`
    : window.location.origin
  const shownKey = keyData?.apiKey
    ? (revealKey ? keyData.apiKey : masked(keyData.apiKey))
    : '…'

  return (
    <div>
      <PageHeader
        title={t('agents.title')}
        description={t('agents.description')}
        actions={
          <Button variant="outline" size="sm" onClick={() => setRevealKey(value => !value)}>
            {revealKey ? t('common.hide') : t('common.show')} {t('agents.apiKey')}
          </Button>
        }
      />

      <section className="mb-6 rounded-3xl border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-medium">{t('agents.quickstartTitle')}</h2>
        <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">{t('agents.quickstart')}</p>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">
            npx @baiibayu/srouter setup-claude --url {origin}
          </code>
          <CopyButton
            text={`npx @baiibayu/srouter setup-claude --url ${origin}`}
            className="size-7 shrink-0"
            label={t('common.copy')}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{t('agents.currentKey')}</span>
          <code className="font-mono break-all">{shownKey}</code>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {toolCatalog.map(tool => {
          const traffic = seen.get(analyticsIds[tool.id] ?? tool.id)
          const detection = detectionData?.agents?.find(a => a.id === tool.id) ?? {
            id: tool.id,
            installed: false,
            configured: false,
            configPath: null,
          }
          const isInstalled = detection.installed
          const isConfigured = detection.configured

          type AgentStatus = 'connected' | 'configured' | 'not-configured' | 'not-installed' | 'guide'
          let status: AgentStatus = 'not-installed'
          if (tool.configType === 'guide') {
            status = 'guide'
          } else if (traffic) {
            status = 'connected'
          } else if (isConfigured) {
            status = 'configured'
          } else if (isInstalled) {
            status = 'not-configured'
          } else {
            status = 'not-installed'
          }

          const descriptionKey = `agents.descriptions.${tool.id}`
          const description = t(descriptionKey)
          return (
            <Link
              key={tool.id}
              to={`/agents/${tool.id}`}
              className="group block rounded-2xl border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <AgentIcon id={tool.id} name={tool.name} className="size-9 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm group-hover:text-primary transition-colors flex items-center gap-1.5 truncate">
                      {tool.name}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {description === descriptionKey
                        ? `${tool.protocol} · ${tool.baseUrlSupport}`
                        : description}
                    </p>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground shrink-0 mt-1" />
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t">
                {statusBadge({ status, t })}
                {WEB_SEARCH_TOOL_KEYS[tool.id] && (
                  <Badge
                    variant="outline"
                    className="h-auto w-fit border-sky-600/30 py-0.5 text-[10px] text-sky-700 dark:text-sky-300 gap-1"
                  >
                    <Globe className="size-3" />
                    {t(WEB_SEARCH_TOOL_KEYS[tool.id])}
                  </Badge>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function statusBadge({
  status,
  t,
}: {
  status: 'connected' | 'configured' | 'not-configured' | 'not-installed' | 'guide'
  t: ReturnType<typeof useI18n>['t']
}) {
  if (status === 'connected') {
    return (
      <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 gap-1">
        <CheckCircle2 className="size-3" />
        {t('agents.connected')}
      </Badge>
    )
  }
  if (status === 'configured') {
    return (
      <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400">
        {t('agents.configured')}
      </Badge>
    )
  }
  if (status === 'not-configured') {
    return (
      <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400">
        {t('agents.notConfigured')}
      </Badge>
    )
  }
  if (status === 'guide') {
    return (
      <Badge variant="outline" className="border-sky-500/30 text-sky-600 dark:text-sky-400">
        {t('agents.guide')}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
      {t('agents.notInstalled')}
    </Badge>
  )
}
