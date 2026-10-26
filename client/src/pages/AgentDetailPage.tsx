import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Zap, CheckCircle2, AlertCircle } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { CopyButton } from '@/components/copy-button'
import { AgentIcon } from '@/components/agent-icons'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetch } from '@/lib/api'
import toolCatalog from '@/data/agent-tools.json'
import { toast } from '@/lib/toast'

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

interface ToolCatalog {
  id: string
  name: string
  category: 'code' | 'agent'
  configType: 'env' | 'file' | 'guide'
  protocol: string
  baseUrlSupport: 'root' | '/v1'
  command: string
  docsUrl: string
  modelBehavior: 'default' | 'full'
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

export default function AgentDetailPage() {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()

  // Find tool from static catalog
  const tool = toolCatalog.find(t => t.id === id) as ToolCatalog | undefined

  const { data: analytics = [] } = useQuery<ClientAnalytics[]>({
    queryKey: ['analytics', 'by-client', '30d'],
    queryFn: () => apiFetch('/api/analytics/by-client?range=30d'),
  })

  const { data: detectionData } = useQuery<{ agents: AgentDetectionItem[] }>({
    queryKey: ['agents', 'detection'],
    queryFn: () => apiFetch('/api/agents/detection'),
  })

  const { data: keyData } = useQuery<KeyResponse>({
    queryKey: ['api-key'],
    queryFn: () => apiFetch('/api/settings/api-key'),
  })

  if (!id || !tool) return <div>Agent not found</div>

  const agentsArray = detectionData?.agents ?? []
  const detection = agentsArray.find(a => a.id === id) ?? { id, installed: false, configured: false, configPath: null }

  const traffic = analytics.find(a => a.clientAgent === (analyticsIds[id] ?? id))
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

  const origin = import.meta.env.DEV
    ? `http://${window.location.hostname}:${__SERVER_PORT__}`
    : window.location.origin
  const command = `npx @baiibayu/srouter ${tool.command} --url ${origin}`
  const endpoint = tool.baseUrlSupport === 'root' ? origin : `${origin}/v1`
  const realConnection = `BASE_URL=${endpoint}\nAPI_KEY=${keyData?.apiKey ?? '<unified-key>'}`
  const shownConnection = `BASE_URL=${endpoint}\nAPI_KEY=${keyData?.apiKey ?? '••••••••••••'}`

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container flex h-14 items-center gap-4 px-4">
          <Link to="/agents">
            <Button variant="ghost" size="sm" aria-label={t('common.back')}>
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <AgentIcon id={tool.id} name={tool.name} className="size-8" />
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{tool.name}</h1>
              {statusBadge({ status, t })}
            </div>
          </div>
        </div>
      </header>

      <div className="container max-w-4xl space-y-6 py-6 px-4">
        {/* Quick Setup */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="size-5 text-emerald-600" />
                {t('agents.quickstartTitle')}
              </CardTitle>
              <CardDescription>
                {tool.configType === 'guide' ? t('agents.setupGuideHint') : t('agents.setupHint')}
                {tool.modelBehavior === 'full' ? ` — ${t('agents.modelNoteFull')}` : ` — ${t('agents.modelNoteDefault')}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{command}</code>
                <CopyButton text={command} className="size-7 shrink-0" label={t('common.copy')} />
              </div>
              <div className="flex gap-2">
                {status === 'guide' ? (
                  <a
                    href={tool.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ variant: 'outline' }), 'flex-1 justify-center')}
                  >
                    <ExternalLink className="size-4 mr-1.5" />
                    {t('agents.viewGuide')}
                  </a>
                ) : status === 'not-installed' ? (
                  <>
                    <Button
                      variant="outline"
                      disabled
                      className="flex-1 justify-center opacity-60 cursor-not-allowed"
                    >
                      {t('agents.installFirst')}
                    </Button>
                    <a
                      href={tool.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: 'default' }), 'justify-center')}
                    >
                      <ExternalLink className="size-4 mr-1.5" />
                      {t('agents.installGuide')}
                    </a>
                  </>
                ) : status === 'not-configured' ? (
                  <Button
                    variant="default"
                    className="flex-1 justify-center"
                    onClick={() => {
                      navigator.clipboard.writeText(command)
                      toast.success(t('common.copied'))
                    }}
                  >
                    {t('agents.applyAuto')}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant={status === 'connected' ? 'outline' : 'secondary'}
                      disabled={status === 'connected'}
                      className="flex-1 justify-center"
                      onClick={() => {
                        navigator.clipboard.writeText(command)
                        toast.success(t('common.copied'))
                      }}
                    >
                      {status === 'connected' ? t('agents.connected') : t('agents.reapply')}
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-8"
                      onClick={() => {
                        toast.info(t('agents.reset'))
                        navigator.clipboard.writeText(command)
                      }}
                    >
                      {t('agents.reset')}
                    </Button>
                  </>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-xl border px-3 py-2">
                <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs">
                  {shownConnection}
                </code>
                <CopyButton text={realConnection} className="size-7 shrink-0" label={t('common.copy')} />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Config File Status */}
        {detection.configPath && (
          <section>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Config file</CardTitle>
                <CardDescription className="text-xs">Location and connection status</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs font-mono break-all">{detection.configPath}</p>
                <div className="mt-2 flex items-center gap-2">
                  {statusBadge({ status: isConfigured ? 'configured' : 'not-configured', t })}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Documentation */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Documentation</CardTitle>
            </CardHeader>
            <CardContent>
              <a
                href={tool.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                {t('agents.documentation')} <ExternalLink className="size-4" />
              </a>
            </CardContent>
          </Card>
        </section>

        {/* Seen Recently Badge */}
        {traffic && (
          <section>
            <Card>
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span className="text-sm text-emerald-600">{t('agents.seenRecently')}</span>
                  <span className="text-xs text-muted-foreground">
                    ≈ {traffic.requests.toLocaleString()} requests
                  </span>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Not installed warning */}
        {!traffic && !isInstalled && tool.configType !== 'guide' && (
          <section>
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 text-amber-600 shrink-0" />
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {t('agents.installFirst')} — {tool.name}
                  </span>
                </div>
              </CardContent>
            </Card>
          </section>
        )}
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