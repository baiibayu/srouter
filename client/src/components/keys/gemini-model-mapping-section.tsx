import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type GeminiFamily = 'default' | 'pro' | 'flash' | 'flashLite'
export type GeminiMap = Record<GeminiFamily, string>

interface MappableModel {
  modelId: string
  displayName: string
  enabled: boolean
}

function scoreGeminiOption(m: MappableModel): number {
  const id = m.modelId.toLowerCase()
  const name = m.displayName.toLowerCase()
  if (id.includes('gemini') || name.includes('gemini')) {
    if (id.includes('2.5') || id.includes('3.1') || id.includes('3.5') || id.includes('3.8')) return 10
    if (id.includes('2.0') || id.includes('1.5')) return 9
    return 8
  }
  if (id.includes('deepseek') || id.includes('qwen') || id.includes('claude') || id.includes('gpt-4o')) return 6
  return 0
}

const families: Array<{ key: GeminiFamily; labelKey: string }> = [
  { key: 'default', labelKey: 'keys.familyDefault' },
  { key: 'pro', labelKey: 'keys.familyGeminiPro' },
  { key: 'flash', labelKey: 'keys.familyGeminiFlash' },
  { key: 'flashLite', labelKey: 'keys.familyGeminiFlashLite' },
]

export function GeminiModelMappingSection({ className }: { className?: string }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { data: mapData } = useQuery<{ map: GeminiMap }>({
    queryKey: ['gemini-map'],
    queryFn: () => apiFetch('/api/settings/gemini-map'),
  })
  const { data: models = [] } = useQuery<MappableModel[]>({
    queryKey: ['fallback'],
    queryFn: () => apiFetch('/api/fallback'),
  })

  const [mapDraft, setMapDraft] = useState<GeminiMap | null>(null)
  const displayedMap = mapDraft ?? mapData?.map ?? null

  const saveMap = useMutation({
    mutationFn: (map: GeminiMap) => apiFetch('/api/settings/gemini-map', {
      method: 'PUT',
      body: JSON.stringify(map),
    }),
    onSuccess: () => {
      setMapDraft(null)
      queryClient.invalidateQueries({ queryKey: ['gemini-map'] })
    },
  })

  const options = Array.from(new Map(
    models.filter(model => model.enabled).map(model => [model.modelId, model]),
  ).values()).sort((a, b) => (scoreGeminiOption(b) - scoreGeminiOption(a)) || a.displayName.localeCompare(b.displayName))

  const mapDirty = !!mapDraft && !!mapData
    && JSON.stringify(mapDraft) !== JSON.stringify(mapData.map)

  return (
    <section className={`rounded-3xl border bg-card p-5 ${className ?? ''}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">{t('keys.geminiTitle')}</h2>
          <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">{t('keys.geminiDesc')}</p>
        </div>
        <Button
          size="sm"
          disabled={!mapDirty || saveMap.isPending}
          onClick={() => mapDraft && saveMap.mutate(mapDraft)}
        >
          {t('common.save')}
        </Button>
      </div>
      <div className="space-y-2">
        {families.map(family => (
          <div key={family.key} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-xs font-medium">{t(family.labelKey)}</span>
            <Select
              value={displayedMap?.[family.key] ?? 'auto'}
              onValueChange={value => setMapDraft(current =>
                ({ ...(current ?? displayedMap ?? {
                  default: 'auto',
                  pro: 'auto',
                  flash: 'auto',
                  flashLite: 'auto',
                }), [family.key]: value }))}
            >
              <SelectTrigger className="w-[320px] max-w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('keys.anthropicAuto')}</SelectItem>
                {options.map(model => (
                  <SelectItem key={model.modelId} value={model.modelId}>
                    {model.displayName !== model.modelId ? `${model.displayName} (${model.modelId})` : model.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </section>
  )
}
