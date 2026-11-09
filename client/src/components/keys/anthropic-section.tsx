import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/i18n'

// Claude (Anthropic) model families the mapping editor exposes. Anthropic
// clients send these names; each maps to "auto" (router picks a free model) or
// a pinned catalog model. Mirrors services/anthropic-map.ts on the server.
type ClaudeFamily = 'default' | 'fable' | 'opus' | 'sonnet' | 'haiku'
type AnthropicMap = Record<ClaudeFamily, string>
interface MappableModel { modelId: string; displayName: string; enabled: boolean }
const FAMILY_ORDER: { key: ClaudeFamily; labelKey?: string; label: string }[] = [
  { key: 'default', labelKey: 'keys.familyDefault', label: 'Default' },
  { key: 'fable', label: 'Fable' },
  { key: 'opus', labelKey: 'keys.familyOpus', label: 'Opus' },
  { key: 'sonnet', labelKey: 'keys.familySonnet', label: 'Sonnet' },
  { key: 'haiku', labelKey: 'keys.familyHaiku', label: 'Haiku' },
]

function scoreAnthropicOption(m: MappableModel): number {
  const id = m.modelId.toLowerCase()
  const name = m.displayName.toLowerCase()
  if (id.includes('claude') || name.includes('claude')) {
    if (id.includes('3-7') || id.includes('3.7') || id.includes('sonnet-4') || id.includes('sonnet-5') || id.includes('opus-4') || id.includes('opus-5')) return 10
    if (id.includes('3-5') || id.includes('3.5')) return 9
    return 8
  }
  if (id.includes('codestral') || id.includes('deepseek-r1') || id.includes('deepseek-v3') || id.includes('qwen-2.5-coder')) return 7
  if (id.includes('gpt-4o') || id.includes('o1') || id.includes('o3')) return 6
  if (id.includes('gemini-2.5') || id.includes('gemini-2.0')) return 5
  return 0
}

// Claude (Anthropic) model mapping: point a Claude / Anthropic SDK client at
// this server and decide how its built-in model names route into the free pool.
export function AnthropicSection() {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  // Anthropic clients append `/v1/messages` to the base URL, so they want the
  // bare origin (OpenAI clients use origin + /v1, shown in the key section).
  const origin = import.meta.env.DEV
    ? `http://${window.location.hostname}:${__SERVER_PORT__}`
    : window.location.origin

  const { data: mapData } = useQuery<{ map: AnthropicMap }>({
    queryKey: ['anthropic-map'],
    queryFn: () => apiFetch('/api/settings/anthropic-map'),
  })
  const { data: models = [] } = useQuery<MappableModel[]>({
    queryKey: ['fallback'],
    queryFn: () => apiFetch('/api/fallback'),
  })
  const { data: compatibility } = useQuery<{ exposeClaudeDiscoveryAliases: boolean }>({
    queryKey: ['agent-compatibility'],
    queryFn: () => apiFetch('/api/settings/agent-compatibility'),
  })

  const [draft, setDraft] = useState<AnthropicMap | null>(null)
  const [syncedMap, setSyncedMap] = useState<AnthropicMap | null>(null)
  if (mapData?.map && mapData.map !== syncedMap) {
    setSyncedMap(mapData.map)
    setDraft(mapData.map)
  }

  const save = useMutation({
    mutationFn: (map: AnthropicMap) => apiFetch('/api/settings/anthropic-map', { method: 'PUT', body: JSON.stringify(map) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['anthropic-map'] }),
  })

  const saveCompatibility = useMutation({
    mutationFn: (patch: { exposeClaudeDiscoveryAliases: boolean }) => apiFetch('/api/settings/agent-compatibility', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-compatibility'] }),
  })

  // Dedup catalog models by id; only enabled models can be pinned.
  // Prioritize modern Claude and high-capability frontier models at top.
  const modelOptions = Array.from(new Map(models.filter(m => m.enabled).map(m => [m.modelId, m])).values())
    .sort((a, b) => (scoreAnthropicOption(b) - scoreAnthropicOption(a)) || a.displayName.localeCompare(b.displayName))
  const dirty = !!(draft && mapData?.map && JSON.stringify(draft) !== JSON.stringify(mapData.map))

  return (
    <section className="rounded-3xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-medium">{t('keys.anthropicTitle')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">{t('keys.anthropicDesc')}</p>
        </div>
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => draft && save.mutate(draft)}>
          {save.isSuccess && !dirty ? t('keys.anthropicSaved') : t('keys.anthropicSave')}
        </Button>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs mb-4">
        <span className="text-muted-foreground">{t('keys.anthropicBaseUrl')}</span>
        <code className="font-mono break-all">{origin}</code>
        <span className="text-muted-foreground">{t('keys.anthropicAuth')}</span>
        <code className="font-mono">x-api-key</code>
      </div>

      <div className="space-y-2">
        {FAMILY_ORDER.map(({ key, labelKey, label }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="w-40 text-xs font-medium shrink-0">{labelKey ? t(labelKey) : label}</span>
            <Select
              value={draft?.[key] ?? 'auto'}
              onValueChange={(v) => setDraft(d => (d ? { ...d, [key]: v } : d))}
            >
              <SelectTrigger className="w-[320px] max-w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('keys.anthropicAuto')}</SelectItem>
                {/* Keep a currently-pinned-but-now-disabled model selectable. */}
                {draft?.[key] && draft[key] !== 'auto' && !modelOptions.some(m => m.modelId === draft[key]) && (
                  <SelectItem value={draft[key]}>{draft[key]}</SelectItem>
                )}
                {modelOptions.map(m => (
                  <SelectItem key={m.modelId} value={m.modelId}>
                    {m.displayName !== m.modelId ? `${m.displayName} (${m.modelId})` : m.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {/* Claude Code Discovery Aliases (claude/<model>) Switch */}
      <div className="mt-4 pt-4 border-t flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium">{t('keys.claudeAliases')}</p>
          <p className="text-xs text-muted-foreground">{t('keys.claudeAliasesHint')}</p>
        </div>
        <Switch
          checked={compatibility?.exposeClaudeDiscoveryAliases ?? false}
          onCheckedChange={checked =>
            saveCompatibility.mutate({ exposeClaudeDiscoveryAliases: checked })}
        />
      </div>

      <p className="text-xs text-muted-foreground mt-4 max-w-prose">{t('keys.anthropicNote')}</p>
    </section>
  )
}
