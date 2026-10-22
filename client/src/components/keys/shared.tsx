import { ExternalLink } from 'lucide-react'
import { useI18n } from '@/i18n'

// Small "Get API key" external link shown next to a provider (#137).
export function GetKeyLink({ url }: { url: string }) {
  const { t } = useI18n()
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {t('keys.getApiKey')}
      <ExternalLink className="size-3" />
    </a>
  )
}

// The provider list itself moved to shared/providers/platforms.ts ΓÇö the one
// file that owns platform id / label / signup URL / keyless (#137, #1331).
export { PLATFORMS } from '../../../../shared/providers/platforms'
export type { PlatformEntry } from '../../../../shared/providers/platforms'

// Everything else lives in shared-constants.ts (a non-component module) so
// this file exports nothing but components ΓÇö react-refresh fast refresh.
// Uppercase-named constants can be re-exported here; the lowercase helpers
// are imported from './shared-constants' directly by their one consumer.
export {
  CUSTOM_GROUP,
  CUSTOM_MODEL_KIND_LABEL,
} from './shared-constants'
export type { HealthPlatform, HealthData } from './shared-constants'
