import { Switch } from '@/components/ui/switch'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Row } from '@/components/config-rows'
import { useI18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

// The Jev-B complexity gate's on/off switch — the ONLY part of System One
// that lives in Settings (Settings → General). Host, model and key live on
// the Models → System One tab. Both ends share the ['complexity-gate']
// react-query cache, so flipping either one updates the other live.
interface ComplexityGateConfig {
  enabled: boolean
}

export function ComplexityGateRow({ active }: { active: boolean }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { data: enabled } = useQuery<boolean>({
    queryKey: ['complexity-gate'],
    queryFn: async () => (await apiFetch<ComplexityGateConfig>('/api/settings/complexity-gate')).enabled,
    enabled: active,
  })
  const patch = useMutation({
    mutationFn: (checked: boolean) =>
      apiFetch<ComplexityGateConfig>('/api/settings/complexity-gate', {
        method: 'PUT',
        body: JSON.stringify({ enabled: checked }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['complexity-gate'], { enabled: data.enabled })
    },
    onError: () => {
      // Re-read the server so a failed flip can't leave the row lying.
      void queryClient.invalidateQueries({ queryKey: ['complexity-gate'] })
    },
  })

  if (enabled === undefined) return null

  return (
    <Row
      label={t('settings.complexityGate')}
      hint={t('settings.complexityGateHelp')}
      control={(
        <Switch
          aria-label={t('settings.complexityGate')}
          checked={enabled}
          disabled={patch.isPending}
          onCheckedChange={checked => patch.mutate(checked)}
        />
      )}
    />
  )
}
