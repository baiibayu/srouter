import { useEffect, useState } from 'react'
import { Heart, ExternalLink, X, Coffee, CreditCard, Gift } from 'lucide-react'
import QRCode from 'qrcode'
import { Dialog, DialogTrigger, DialogPopup } from '@/components/ui/dialog'
import { useI18n } from '@/i18n'

const PLATFORMS = [
  {
    key: 'trakteer',
    url: 'https://trakteer.id/baiibayu/tip',
    label: 'Trakteer',
    desc: 'donate.trakteer',
    color: '#e11d48',
    Icon: Gift,
  },
  {
    key: 'kofi',
    url: 'https://ko-fi.com/baiibayu',
    label: 'Ko-fi',
    desc: 'donate.kofi',
    color: '#FF5E5B',
    Icon: Coffee,
  },
  {
    key: 'paypal',
    url: 'https://www.paypal.me/baiibayu',
    label: 'PayPal',
    desc: 'donate.paypal',
    color: '#0070BA',
    Icon: CreditCard,
  },
] as const

function QrImage({ url, label }: { url: string; label: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then(setSrc)
      .catch(() => {})
  }, [url])
  if (!src) return <div className="aspect-square w-full max-w-[180px] animate-pulse rounded-lg bg-muted" />
  return <img src={src} alt={`${label} QR`} className="aspect-square w-full max-w-[180px] rounded-lg bg-white p-1" />
}

function ChannelCard({ platform, openLabel }: { platform: (typeof PLATFORMS)[number]; openLabel: string }) {
  const { t } = useI18n()
  const { Icon } = platform
  return (
    <div
      className="flex flex-col items-center rounded-xl border bg-card/50 p-4 transition-colors hover:border-foreground/20"
    >
      <div
        className="mb-3 flex size-12 items-center justify-center rounded-full"
        style={{ backgroundColor: `${platform.color}20`, color: platform.color }}
      >
        <Icon className="size-6" />
      </div>
      <p className="mb-1 text-sm font-semibold">{platform.label}</p>
      <p className="mb-3 text-center text-xs text-muted-foreground">{t(platform.desc)}</p>
      <QrImage url={platform.url} label={platform.label} />
      <a
        href={platform.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: platform.color }}
      >
        {openLabel} <ExternalLink className="size-4" />
      </a>
    </div>
  )
}

// Floating donate button — bottom-right, visible on every page.
// Click → centered dialog with Trakteer / Ko-fi / PayPal cards + scannable QR.
export function DonateButton() {
  const { t } = useI18n()
  return (
    <Dialog>
      <DialogTrigger
        title={t('donate.support')}
        aria-label={t('donate.support')}
        className="group fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border bg-card shadow-lg ring-1 ring-foreground/5 transition-all hover:scale-110 hover:shadow-xl sm:bottom-6 sm:right-6"
      >
        <Heart className="size-5 text-red-500 transition-transform group-hover:scale-110" />
      </DialogTrigger>
      <DialogPopup maxWidth="max-w-3xl">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Heart className="size-5 text-red-500" />
            {t('donate.title')}
          </h2>
          <DialogTrigger className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent">
            <X className="size-5" />
          </DialogTrigger>
        </div>
        <p className="mt-4 mb-6 text-center text-sm text-muted-foreground">
          {t('donate.message')}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLATFORMS.map((p) => (
            <ChannelCard key={p.key} platform={p} openLabel={t('donate.open')} />
          ))}
        </div>
      </DialogPopup>
    </Dialog>
  )
}
