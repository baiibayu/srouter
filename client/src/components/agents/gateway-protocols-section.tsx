import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Server, Cpu } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

type OllamaMode = 'off' | 'open-loopback' | 'key-required'

interface Compatibility {
  ollamaEmulation: OllamaMode
  exposeClaudeDiscoveryAliases: boolean
}

export function GatewayProtocolsSection() {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  const { data: compatibility } = useQuery<Compatibility>({
    queryKey: ['agent-compatibility'],
    queryFn: () => apiFetch('/api/settings/agent-compatibility'),
  })
  const { data: mcp } = useQuery<{ enabled: boolean }>({
    queryKey: ['enable-mcp'],
    queryFn: () => apiFetch('/api/settings/enable-mcp'),
  })

  const saveCompatibility = useMutation({
    mutationFn: (patch: Partial<Compatibility>) => apiFetch('/api/settings/agent-compatibility', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-compatibility'] }),
  })

  const saveMcp = useMutation({
    mutationFn: (enabled: boolean) => apiFetch('/api/settings/enable-mcp', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['enable-mcp'] }),
  })

  return (
    <section className="mb-6 rounded-3xl border bg-card p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium">{t('keys.compatibilityTitle')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('keys.compatibilityDesc')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Ollama Emulation */}
        <div className="rounded-2xl border bg-muted/20 p-4 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="size-4 text-primary shrink-0" />
              <p className="text-xs font-semibold">{t('keys.ollamaMode')}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{t('keys.ollamaModeHint')}</p>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <span className="text-[11px] font-mono text-muted-foreground">/api/tags, /api/chat</span>
            <Select
              value={compatibility?.ollamaEmulation ?? 'off'}
              onValueChange={value => saveCompatibility.mutate({ ollamaEmulation: value as OllamaMode })}
            >
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">{t('keys.ollamaOff')}</SelectItem>
                <SelectItem value="open-loopback">{t('keys.ollamaLoopback')}</SelectItem>
                <SelectItem value="key-required">{t('keys.ollamaKeyRequired')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* MCP Server */}
        <div className="rounded-2xl border bg-muted/20 p-4 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Server className="size-4 text-primary shrink-0" />
              <p className="text-xs font-semibold">{t('keys.mcpServer')}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{t('keys.mcpServerHint')}</p>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <span className="text-[11px] font-mono text-muted-foreground">/mcp endpoint</span>
            <Switch
              checked={mcp?.enabled ?? false}
              onCheckedChange={checked => saveMcp.mutate(checked)}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
