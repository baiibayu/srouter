import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Globe } from 'lucide-react'
import { useI18n } from '@/i18n'
import { ProxyNodeDialog } from './proxy-node-dialog'
import { ProxyQuickDeployDialog } from './proxy-quick-deploy-dialog'
import type { ProxyPoolNode } from '../../../../shared/types'

interface ProxyPoolsResponse {
  pools: ProxyPoolNode[]
}

export function ProxySettingsSection() {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  const [addNodeOpen, setAddNodeOpen] = useState(false)
  const [quickDeployOpen, setQuickDeployOpen] = useState(false)
  const [testingNodeId, setTestingNodeId] = useState<string | null>(null)

  const { data: poolsData, isError } = useQuery<ProxyPoolsResponse>({
    queryKey: ['proxy-pools'],
    queryFn: () => apiFetch('/api/settings/proxy/pools'),
  })

  const toggleNode = useMutation({
    meta: { silenceToast: true },
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch<ProxyPoolNode>(`/api/settings/proxy/pools/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxy-pools'] })
      queryClient.invalidateQueries({ queryKey: ['proxy-url'] })
    },
  })

  const deleteNode = useMutation({
    meta: { silenceToast: true },
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/api/settings/proxy/pools/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxy-pools'] })
      queryClient.invalidateQueries({ queryKey: ['proxy-url'] })
    },
  })

  const testNode = async (id: string) => {
    setTestingNodeId(id)
    try {
      await apiFetch<{ ok: boolean; latencyMs?: number; error?: string }>(`/api/settings/proxy/pools/${id}/test`, {
        method: 'POST',
      })
      queryClient.invalidateQueries({ queryKey: ['proxy-pools'] })
      queryClient.invalidateQueries({ queryKey: ['proxy-url'] })
    } catch {
      // Handled in query refresh
    } finally {
      setTestingNodeId(null)
    }
  }

  const pools = poolsData?.pools ?? []

  return (
    <section className="rounded-3xl border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Globe className="size-3.5 text-muted-foreground" />
            {t('keys.proxyPoolsTitle')}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('keys.outboundProxyDescription')}
          </p>
        </div>
      </div>

      {isError ? (
        <p className="text-xs text-muted-foreground">{t('keys.proxyLoadFailed')}</p>
      ) : (
        <>
          {/* Actions Bar & Node Registry Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-foreground">{t('keys.proxyNodesHeader')}</span>
              <p className="text-[11px] text-muted-foreground">
                {t('keys.proxyNodesSubheader')}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAddNodeOpen(true)}
              >
                {t('keys.addProxyNode')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setQuickDeployOpen(true)}
              >
                {t('keys.deployRelay')}
              </Button>
            </div>
          </div>

          {/* Proxy Pool Nodes List */}
          <div className="space-y-2">
            {pools.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-5 text-center text-xs text-muted-foreground">
                <p>{t('keys.noProxyNodesYet')}</p>
                <div className="flex justify-center gap-2 pt-3">
                  <Button size="sm" variant="outline" onClick={() => setAddNodeOpen(true)}>
                    {t('keys.addNode')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setQuickDeployOpen(true)}>
                    {t('keys.deployRelay')}
                  </Button>
                </div>
              </div>
            ) : (
              pools.map((node) => {
                const isTesting = testingNodeId === node.id
                const isClustered = Boolean(node.endpoints && node.endpoints.length > 0)
                const nodeRole = node.role || 'primary'
                return (
                  <div
                    key={node.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-3.5 py-2.5"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground truncate">
                          {node.name || t('keys.unnamedProxy')}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono h-4 px-1.5">
                          {node.protocol}
                        </Badge>
                        {isClustered && (
                          <Badge variant="outline" className="text-[10px] font-mono h-4 px-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                            Cluster ({node.endpoints!.length} IPs)
                          </Badge>
                        )}
                        {nodeRole === 'fallback' && (
                          <Badge variant="outline" className="text-[10px] uppercase font-mono h-4 px-1.5 border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                            {t('keys.proxyRoleFallback')}
                          </Badge>
                        )}
                        {nodeRole === 'targeted' && (
                          <Badge variant="outline" className="text-[10px] uppercase font-mono h-4 px-1.5 border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10">
                            {t('keys.proxyRoleTargeted')} {node.targetedPlatforms?.length ? `(${node.targetedPlatforms.join(', ')})` : ''}
                          </Badge>
                        )}
                        {node.status === 'active' && typeof node.latencyMs === 'number' && (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold" style={{ color: '#10b981' }}>
                            {node.latencyMs}ms
                          </span>
                        )}
                        {node.status === 'error' && (
                          <span className="text-[11px] text-destructive truncate max-w-xs" title={node.lastError ?? ''}>
                            {node.lastError || 'Error'}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono truncate max-w-sm sm:max-w-md">
                        {isClustered ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium" style={{ color: '#10b981' }}>
                            {t('keys.rotatingIps', { count: node.endpoints!.length })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{node.url}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2.5"
                        disabled={isTesting}
                        onClick={() => testNode(node.id)}
                      >
                        {isTesting ? t('keys.testingProxy') : t('keys.testProxy')}
                      </Button>
                      <Switch
                        size="sm"
                        checked={node.enabled}
                        disabled={toggleNode.isPending}
                        onCheckedChange={(checked) => toggleNode.mutate({ id: node.id, enabled: checked })}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                        disabled={deleteNode.isPending}
                        onClick={() => deleteNode.mutate(node.id)}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Environment variables & Tips */}
          <div className="border-t pt-3 text-[11px] text-muted-foreground space-y-1">
            <p>
              {t('keys.proxyEnvHintBefore')}<code className="font-mono">PROXY_URL</code>{t('keys.proxyEnvHintAfter')}
            </p>
            <p>
              {t('keys.supportedTransportsHint')}
            </p>
          </div>
        </>
      )}

      {/* Dialogs */}
      <ProxyNodeDialog open={addNodeOpen} onOpenChange={setAddNodeOpen} />
      <ProxyQuickDeployDialog open={quickDeployOpen} onOpenChange={setQuickDeployOpen} />
    </section>
  )
}
