import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/page-header'
import { ModelsTabs } from '@/components/models-tabs'
import { SystemOneModelsView } from '@/components/systemone-models'
import { useI18n } from '@/i18n'
import { Cpu, ShieldCheck, Zap } from 'lucide-react'

export default function SystemOnePage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  const { data: routing } = useQuery<{ strategy: string }>({
    queryKey: ['fallback', 'routing'],
    queryFn: () => apiFetch('/api/fallback/routing'),
    refetchInterval: 5_000,
  })

  const strategyMutation = useMutation({
    mutationFn: (strategy: string) =>
      apiFetch('/api/fallback/routing', {
        method: 'PUT',
        body: JSON.stringify({ strategy }),
      }),
    onMutate: async (newStrategy) => {
      await queryClient.cancelQueries({ queryKey: ['fallback', 'routing'] })
      const previous = queryClient.getQueryData<{ strategy: string }>(['fallback', 'routing'])
      queryClient.setQueryData(['fallback', 'routing'], (old: { strategy: string } | undefined) => ({
        ...old,
        strategy: newStrategy,
      }))
      return { previous }
    },
    onError: (_err, _newStrategy, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['fallback', 'routing'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['fallback', 'routing'] })
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
    },
  })

  const isSystemOneActive = routing?.strategy === 'systemone'

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('models.systemOneTab')}
        description={t('models.systemOneBlurb')}
        divider={false}
        tabs={<ModelsTabs />}
      />

      {/* Master Routing Strategy Card */}
      <section className="rounded-3xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">{t('strategies.systemone')}</span>
              <Badge variant={isSystemOneActive ? 'default' : 'secondary'}>
                {isSystemOneActive ? t('models.systemOneOn') : t('models.systemOneOff')}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('strategies.systemoneBlurb')}
            </p>
          </div>
          <Switch
            size="sm"
            aria-label={t('strategies.systemone')}
            checked={isSystemOneActive}
            disabled={strategyMutation.isPending}
            onCheckedChange={checked => strategyMutation.mutate(checked ? 'systemone' : 'balanced')}
          />
        </div>
      </section>

      {/* Engine Intelligence & Provider Integration Status */}
      <section className="rounded-3xl border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">{t('models.systemOneTab')} — Architecture & Capabilities</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Autonomous decision engine that borrows credentials from your connected providers without manual re-entry.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border bg-muted/30 p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-foreground font-medium text-xs">
              <Zap className="size-4 text-amber-500 shrink-0" />
              <span>Direct Prompt Classification</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Classifies prompts into trivial, normal, and hard tiers. Light tasks route to ultra-fast models, complex prompts route to peak intelligence models.
            </p>
          </div>

          <div className="rounded-2xl border bg-muted/30 p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-foreground font-medium text-xs">
              <Cpu className="size-4 text-emerald-500 shrink-0" />
              <span>Dynamic Provider Key Sharing</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Automatically reuses existing keys from connected providers (Cloudflare, TypeSafe, OpenRouter) or free endpoints with zero duplicate configuration.
            </p>
          </div>

          <div className="rounded-2xl border bg-muted/30 p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-foreground font-medium text-xs">
              <ShieldCheck className="size-4 text-blue-500 shrink-0" />
              <span>Field-Aware Reliability</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Tracks real-time failure penalties to instantly deprioritize 401/404/broken models, and strictly enforces tool support for agentic coding tasks.
            </p>
          </div>
        </div>
      </section>

      {/* System One Decision Models View */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t('models.systemOneTab')} — {t('decision.tab')}</h2>
        <SystemOneModelsView />
      </section>
    </div>
  )
}
