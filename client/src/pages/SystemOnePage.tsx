import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ChevronDown } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/page-header'
import { SectionHeader, Row } from '@/components/config-rows'
import { ModelsTabs } from '@/components/models-tabs'
import { useI18n } from '@/i18n'

// Shape of GET/PUT /api/settings/complexity-gate (server routes/settings.ts).
// jevApiKey is write-only: the server reports hasJevApiKey, never the value.
interface ComplexityGateConfig {
  enabled: boolean
  backend: 'heuristic' | 'jev' | 'decision'
  jevBaseUrl: string
  jevModel: string
  jevHostPreset: string
  jevKeyless: boolean
  jevTimeoutMs: number
  hasJevApiKey: boolean
  jevKeyStored: boolean
  detectedHosts: string[]
}

// Preset hosts — mirrors JEV_HOST_PRESETS in server services/complexity-gate.ts.
// Picking one saves its base URL (and clears any model override) so the
// server resolves headers, key requirement and default model for that host.
const HOST_PRESETS: Array<{ id: string; baseUrl: string; labelKey: string }> = [
  { id: 'zen', baseUrl: 'https://opencode.ai/zen', labelKey: 'settings.jevHostZen' },
  { id: 'openrouter', baseUrl: 'https://openrouter.ai', labelKey: 'settings.jevHostOpenrouter' },
  { id: 'typesafe', baseUrl: 'https://api.typesafe.ai', labelKey: 'settings.jevHostTypesafe' },
  { id: 'v1m', baseUrl: 'https://v1m.ir', labelKey: 'settings.jevHostV1m' },
  { id: 'system-one-dev', baseUrl: 'https://system-one.dev', labelKey: 'settings.jevHostSystemOneDev' },
  { id: 'jev-ai', baseUrl: 'https://jev-ai.pro', labelKey: 'settings.jevHostJevAi' },
]

// Models → System One: the gate's ONE card. Status first (model-list style),
// then the remote config flow: on/off → host → model → (URL only for custom,
// key only when the host needs one). The master switch lives in
// Settings → General; remote-off just means "local heuristic only".
export default function SystemOnePage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { data: cfg } = useQuery<ComplexityGateConfig>({
    queryKey: ['complexity-gate'],
    queryFn: () => apiFetch('/api/settings/complexity-gate'),
  })
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<ComplexityGateConfig>('/api/settings/complexity-gate', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['complexity-gate'], data)
    },
  })
  const [urlDraft, setUrlDraft] = useState('')
  const [urlSaved, setUrlSaved] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [modelDraft, setModelDraft] = useState('')
  const [modelSaved, setModelSaved] = useState(false)
  // Host → key rows hide behind a toggle so the card reads as a status view,
  // not a key-linking form. Opens by itself when remote scoring is on.
  const [configOpen, setConfigOpen] = useState(false)
  const [configInit, setConfigInit] = useState(false)

  const [syncedUrl, setSyncedUrl] = useState<string | null>(null)
  if (cfg && cfg.jevBaseUrl !== syncedUrl) {
    setSyncedUrl(cfg.jevBaseUrl)
    setUrlDraft(cfg.jevBaseUrl)
  }

  const [syncedModel, setSyncedModel] = useState<string | null>(null)
  if (cfg && cfg.jevModel !== syncedModel) {
    setSyncedModel(cfg.jevModel)
    setModelDraft(cfg.jevModel)
  }

  if (cfg && !configInit) {
    setConfigOpen(cfg.backend === 'jev')
    setConfigInit(true)
  }

  const enabled = cfg?.enabled ?? false
  const remoteActive = enabled && cfg?.backend === 'jev'
  // Key available but not stored: the scorer borrows the linked provider key
  // at call time — the row reads as a status line, not an input.
  const borrowedKey = !!cfg && !cfg.jevKeyless && cfg.hasJevApiKey && !cfg.jevKeyStored

  const hostLabel = (preset: string) =>
    preset === 'custom'
      ? t('settings.jevHostCustom')
      : t(HOST_PRESETS.find(p => p.id === preset)?.labelKey ?? 'settings.jevHostCustom')

  const statusRow = (options: {
    name: string
    detail?: string
    active: boolean
    badge: string
    missingKey?: boolean
  }) => (
    <div className="flex items-center gap-2 min-w-0 text-sm">
      <span
        className="size-2 rounded-sm shrink-0"
        style={{ backgroundColor: options.active ? 'rgb(34,197,94)' : 'rgb(148,163,184)' }}
      />
      <span className="truncate font-medium">{options.name}</span>
      {options.detail && (
        <span className="truncate text-muted-foreground/70 text-xs font-normal">{options.detail}</span>
      )}
      <span className="flex-1" />
      {options.missingKey && (
        <span className="text-xs text-amber-600 dark:text-amber-400">{t('models.systemOneKeyMissing')}</span>
      )}
      <Badge variant={options.active ? 'default' : 'secondary'}>{options.badge}</Badge>
    </div>
  )

  if (!cfg) return null

  return (
    <div>
      <PageHeader title={t('models.systemOneTab')} description={t('models.systemOneBlurb')} divider={false} tabs={<ModelsTabs />} />
      <section className="rounded-3xl border bg-card p-5">
        <SectionHeader title={t('settings.complexityGate')} description={t('models.systemOneSectionDesc')} />

        {/* Status: what answers right now (model-list style). The heuristic
            participates whenever the gate is on — it is the automatic
            fallback layer, not an either/or pick. */}
        <div className="space-y-3.5">
          {statusRow({
            name: t('settings.complexityGateHeuristic'),
            detail: t('models.systemOneHeuristicDetail'),
            active: enabled,
            badge: enabled ? t('models.systemOneOn') : t('models.systemOneOff'),
          })}
          {statusRow({
            name: t('models.systemOneRemote'),
            detail: cfg ? `${hostLabel(cfg.jevHostPreset)} → ${cfg.jevModel}` : undefined,
            active: remoteActive,
            badge: remoteActive ? t('models.systemOneOn') : t('models.systemOneOff'),
            missingKey: remoteActive && !cfg.jevKeyless && !cfg.hasJevApiKey,
          })}
          {statusRow({
            name: t('models.systemOneDecision'),
            detail: t('models.systemOneDecisionDetail'),
            active: enabled && cfg.backend === 'decision',
            badge: enabled && cfg.backend === 'decision' ? t('models.systemOneOn') : t('models.systemOneOff'),
          })}
        </div>

        {/* Configuration: flow top-down — remote on/off, host, model, then
            only the rows that apply (URL for custom hosts, key for paid
            hosts). Zen keyless shows neither. */}
        <div className="mt-4 border-t border-border/60 pt-1">
          <Row
            label={t('settings.complexityGateRemote')}
            hint={t('settings.complexityGateRemoteHint')}
            control={(
              <Switch
                size="sm"
                aria-label={t('settings.complexityGateRemote')}
                checked={cfg.backend === 'jev'}
                onCheckedChange={checked => patch.mutate({ backend: checked ? 'jev' : 'heuristic' })}
              />
            )}
          />
          <Row
            label={t('settings.complexityGateDecision')}
            hint={t('settings.complexityGateDecisionHint')}
            control={(
              <Switch
                size="sm"
                aria-label={t('settings.complexityGateDecision')}
                checked={cfg.backend === 'decision'}
                onCheckedChange={checked => patch.mutate({ backend: checked ? 'decision' : 'heuristic' })}
              />
            )}
          />
          <button
            type="button"
            aria-expanded={configOpen}
            onClick={() => setConfigOpen(open => !open)}
            className="flex w-full items-center gap-1.5 py-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronDown
              className={`size-4 transition-transform ${configOpen ? '' : '-rotate-90'}`}
              aria-hidden
            />
            {t('models.systemOneConfigToggle')}
          </button>
          {configOpen && (
            <div className="pb-1">
              <Row
                label={t('settings.jevHost')}
            control={(
              <Select
                value={cfg.jevHostPreset === 'custom' ? 'custom' : cfg.jevHostPreset}
                onValueChange={value => {
                  const preset = HOST_PRESETS.find(p => p.id === value)
                  if (preset) patch.mutate({ jevBaseUrl: preset.baseUrl, jevModel: null })
                }}
              >
                <SelectTrigger className="w-56" aria-label={t('settings.jevHost')}>
                  <SelectValue>
                    {(value: string) => hostLabel(value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HOST_PRESETS.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {t(p.labelKey)}
                      {cfg.detectedHosts?.includes(p.id) && (
                        <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                          · {t('settings.jevHostDetected')}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom" disabled={cfg.jevHostPreset !== 'custom'}>
                    {t('settings.jevHostCustom')}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <Row
            label={t('settings.complexityGateJevModel')}
            hint={t('settings.complexityGateJevModelHelp')}
            control={(
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={modelDraft}
                  onChange={event => setModelDraft(event.target.value)}
                  placeholder={cfg.jevModel}
                  aria-label={t('settings.complexityGateJevModel')}
                  className="h-9 w-52 rounded-lg border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = modelDraft.trim()
                    patch.mutate({ jevModel: trimmed === '' ? null : trimmed })
                    setModelSaved(true)
                    setTimeout(() => setModelSaved(false), 1500)
                  }}
                  disabled={patch.isPending || modelDraft.trim() === cfg.jevModel}
                  className="h-9 shrink-0 rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {modelSaved ? t('settings.complexityGateSaved') : t('common.save')}
                </button>
              </div>
            )}
          />
          {cfg.jevHostPreset === 'custom' && (
            <Row
              label={t('settings.complexityGateJevUrl')}
              hint={t('settings.complexityGateJevUrlHelp')}
            control={(
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={urlDraft}
                  onChange={event => setUrlDraft(event.target.value)}
                  placeholder={cfg.jevBaseUrl}
                  aria-label={t('settings.complexityGateJevUrl')}
                  className="h-9 w-52 rounded-lg border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = urlDraft.trim()
                    patch.mutate({ jevBaseUrl: trimmed === '' ? null : trimmed })
                    setUrlSaved(true)
                    setTimeout(() => setUrlSaved(false), 1500)
                  }}
                  disabled={patch.isPending || urlDraft.trim() === cfg.jevBaseUrl}
                  className="h-9 shrink-0 rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {urlSaved ? t('settings.complexityGateSaved') : t('common.save')}
                </button>
              </div>
            )}
          />
          )}
          <Row
            label={t('settings.complexityGateJevKey')}
            hint={cfg?.jevKeyless || borrowedKey ? undefined : t('settings.complexityGateJevKeyHelp')}
            control={cfg?.jevKeyless ? (
              <span className="text-sm text-muted-foreground">{t('settings.complexityGateJevKeyless')}</span>
            ) : borrowedKey ? (
              <span className="text-sm text-muted-foreground">{t('settings.jevKeyFromProvider')}</span>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={keyDraft}
                  onChange={event => setKeyDraft(event.target.value)}
                  placeholder={cfg.hasJevApiKey ? '••••••••' : t('settings.complexityGateJevKeyPlaceholder')}
                  aria-label={t('settings.complexityGateJevKey')}
                  className="h-9 w-52 rounded-lg border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = keyDraft.trim()
                    patch.mutate({ jevApiKey: trimmed === '' ? null : trimmed })
                    setKeyDraft('')
                    setKeySaved(true)
                    setTimeout(() => setKeySaved(false), 1500)
                  }}
                  disabled={patch.isPending || (keyDraft.trim() === '' && !cfg.hasJevApiKey)}
                  className="h-9 shrink-0 rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {keySaved ? t('settings.complexityGateSaved') : t('common.save')}
                </button>
              </div>
            )}
          />
            </div>
          )}
        </div>

        <p className="mt-4 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
          {t('models.systemOneConfigure')}
        </p>
      </section>
    </div>
  )
}
