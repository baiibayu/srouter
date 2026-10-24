import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Globe } from 'lucide-react'
import { useI18n } from '@/i18n'
import { PLATFORMS, CUSTOM_GROUP } from './shared'
import { ProxyNodeDialog } from './proxy-node-dialog'
import { ProxyQuickDeployDialog } from './proxy-quick-deploy-dialog'
import type { ApiKey, ProxyPoolNode, ProxyPoolStrategy } from '../../../../shared/types'

interface ProxySettings {
  proxyUrl: string
  proxyMode: string
  fetchRelayTokenConfigured: boolean
  enabled: boolean
  bypassPlatforms: string[]
  active: boolean
}

interface ProxyPoolsResponse {
  pools: ProxyPoolNode[]
  strategy: ProxyPoolStrategy
}

export function ProxySettingsSection() {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  const [addNodeOpen, setAddNodeOpen] = useState(false)
  const [quickDeployOpen, setQuickDeployOpen] = useState(false)
  const [testingNodeId, setTestingNodeId] = useState<string | null>(null)

  const { data: proxyData, isError: isProxyError } = useQuery<ProxySettings>({
    queryKey: ['proxy-url'],
    queryFn: () => apiFetch('/api/settings/proxy'),
  })

  const { data: poolsData } = useQuery<ProxyPoolsResponse>({
    queryKey: ['proxy-pools'],
    queryFn: () => apiFetch('/api/settings/proxy/pools'),
  })

  const { data: keys = [] } = useQuery<ApiKey[]>({
    queryKey: ['keys'],
    queryFn: () => apiFetch('/api/keys'),
  })

  const saveProxy = useMutation({
    meta: { silenceToast: true },
    mutationFn: (body: { enabled?: boolean; bypassPlatforms?: string[] }) =>
      apiFetch<ProxySettings>('/api/settings/proxy', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxy-url'] })
      queryClient.invalidateQueries({ queryKey: ['proxy-pools'] })
    },
  })

  const saveStrategy = useMutation({
    meta: { silenceToast: true },
    mutationFn: (strategy: ProxyPoolStrategy) =>
      apiFetch<{ strategy: ProxyPoolStrategy }>('/api/settings/proxy/pools/strategy', {
        method: 'PUT',
        body: JSON.stringify({ strategy }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxy-pools'] })
    },
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

  const enabled = proxyData?.enabled ?? true
  const active = proxyData?.active ?? false
  const pools = poolsData?.pools ?? []
  const strategy = poolsData?.strategy ?? 'round-robin'

  // Per-platform switches setup
  const allProxyPlatforms = [...PLATFORMS, CUSTOM_GROUP]
  const configuredProxyPlatforms = allProxyPlatforms.filter(p =>
    keys.some(k => k.platform === p.value) || ('keyless' in p && p.keyless)
  )
  const bypassed = new Set(proxyData?.bypassPlatforms ?? [])
  const everyPlatformBypassed = allProxyPlatforms.every(p => bypassed.has(p.value))
  const everyPlatformRouted = allProxyPlatforms.every(p => !bypassed.has(p.value))

  const setAllProxyRoutes = (routed: boolean) => {
    const next = new Set(proxyData?.bypassPlatforms ?? [])
    for (const platform of allProxyPlatforms) {
      if (routed) next.delete(platform.value)
      else next.add(platform.value)
    }
    saveProxy.mutate({ bypassPlatforms: [...next] })
  }

  return (
    <section className="rounded-3xl border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Globe className="size-3.5 text-muted-foreground" />
            Proxy Pools
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('keys.outboundProxyDescription')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => saveProxy.mutate({ enabled: checked })}
            disabled={saveProxy.isPending || !proxyData}
          />
          {active && enabled && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
              {t('common.active')}
            </span>
          )}
        </div>
      </div>

      {isProxyError ? (
        <p className="text-xs text-muted-foreground">{t('keys.proxyLoadFailed')}</p>
      ) : (
        <>
          {/* Strategy & Actions Bar */}
          <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Pool strategy</Label>
              <Select
                value={strategy}
                onValueChange={(val) => saveStrategy.mutate(val as ProxyPoolStrategy)}
              >
                <SelectTrigger className="w-[180px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="round-robin" label="Round-robin">Round-robin</SelectItem>
                  <SelectItem value="random" label="Random">Random</SelectItem>
                  <SelectItem value="forward" label="Primary / Fallback">Primary / Fallback</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAddNodeOpen(true)}
              >
                Add proxy node
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setQuickDeployOpen(true)}
              >
                Deploy &amp; Setup Relay
              </Button>
            </div>
          </div>

          {/* Proxy Pool Nodes List */}
          <div className="space-y-2">
            {pools.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-5 text-center text-xs text-muted-foreground">
                <p>No proxy nodes in the pool yet.</p>
                <div className="flex justify-center gap-2 pt-3">
                  <Button size="sm" variant="outline" onClick={() => setAddNodeOpen(true)}>
                    Add node
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setQuickDeployOpen(true)}>
                    Deploy Relay
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
                          {node.name || 'Unnamed Proxy'}
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
                            Fallback
                          </Badge>
                        )}
                        {nodeRole === 'targeted' && (
                          <Badge variant="outline" className="text-[10px] uppercase font-mono h-4 px-1.5 border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10">
                            Targeted {node.targetedPlatforms?.length ? `(${node.targetedPlatforms.join(', ')})` : ''}
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
                            Rotating across {node.endpoints!.length} IPs (Internal Sub-Routing)
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
                        {isTesting ? 'Testing…' : 'Test'}
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
                        Delete
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Per-platform Routing Switches */}
          {enabled && configuredProxyPlatforms.length > 0 && (
            <div className="border-t pt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium">{t('keys.routeViaProxy')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={saveProxy.isPending || !proxyData || everyPlatformBypassed}
                    onClick={() => setAllProxyRoutes(false)}
                  >
                    {t('keys.bulkDisable')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={saveProxy.isPending || !proxyData || everyPlatformRouted}
                    onClick={() => setAllProxyRoutes(true)}
                  >
                    {t('keys.bulkEnable')}
                  </Button>
                </div>
              </div>

              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {configuredProxyPlatforms.map((p) => {
                  const routed = !bypassed.has(p.value)
                  return (
                    <label key={p.value} className="flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50 cursor-pointer">
                      <Switch
                        size="sm"
                        className="shrink-0"
                        checked={routed}
                        disabled={saveProxy.isPending || !proxyData}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? (proxyData?.bypassPlatforms ?? []).filter((x) => x !== p.value)
                            : [...(proxyData?.bypassPlatforms ?? []), p.value]
                          saveProxy.mutate({ bypassPlatforms: next })
                        }}
                      />
                      <span className="min-w-0 truncate">{p.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Environment variables & Tips */}
          <div className="border-t pt-3 text-[11px] text-muted-foreground space-y-1">
            <p>
              {t('keys.proxyEnvHintBefore')}<code className="font-mono">PROXY_URL</code>{t('keys.proxyEnvHintAfter')}
            </p>
            <p>
              Supported transports: SOCKS5, HTTP/HTTPS forward proxies, and Cloudflare Workers, Vercel Edge, Deno Deploy, and Netlify Edge fetch relays.
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
