import { Heart } from 'lucide-react'
import { useI18n } from '@/i18n'

const TRAKTEER_URL = 'https://trakteer.id/baiibayu'

// Floating donate button — bottom-right, visible on every page.
// Opens Trakteer in a new tab; no popover/overlay needed for simplicity.
export function DonateButton() {
  const { t } = useI18n()
  return (
    <a
      href={TRAKTEER_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={t('donate.support')}
      aria-label={t('donate.support')}
      className="group fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border bg-card shadow-lg ring-1 ring-foreground/5 transition-all hover:scale-110 hover:shadow-xl sm:bottom-6 sm:right-6"
    >
      <Heart className="size-5 text-red-500 transition-transform group-hover:scale-110" />
      <span className="pointer-events-none absolute right-full mr-2 hidden whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md sm:block">
        {t('donate.support')}
      </span>
    </a>
  )
}
