import { useMemo } from 'react'
import { useI18n } from '@/i18n'
import { formatTokens, platformColors } from '@/lib/routing'

// High-contrast, distinct palette ensuring neighboring models never look alike
const DISTINCT_PALETTE = [
  '#0284c7', // Sky Blue
  '#10b981', // Emerald Green
  '#f97316', // Bright Orange
  '#8b5cf6', // Violet
  '#f43f5e', // Rose
  '#06b6d4', // Cyan
  '#eab308', // Amber Gold
  '#d946ef', // Fuchsia / Magenta
  '#14b8a6', // Teal
  '#4f46e5', // Deep Indigo
  '#84cc16', // Lime
  '#ec4899', // Pink
]

/**
 * Deterministik generator warna otomatis untuk model baru yang belum terdaftar di platformColors
 * atau untuk model yang warnanya bentrok dengan model lain di dalam kartu yang sama.
 */
function autoModelColor(key: string, usedColors: Set<string>): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i)
    hash |= 0
  }
  const abs = Math.abs(hash)
  // 1. Coba pilih warna yang belum terpakai dari palet kontras kurasi
  for (let i = 0; i < DISTINCT_PALETTE.length; i++) {
    const candidate = DISTINCT_PALETTE[(abs + i) % DISTINCT_PALETTE.length]
    if (!usedColors.has(candidate)) {
      return candidate
    }
  }
  // 2. Jika palet penuh, hasilkan hue menggunakan golden ratio agar distribusi warna merata
  for (let i = 0; i < 16; i++) {
    const hue = Math.round((abs + i * 137.508) % 360)
    const color = `hsl(${hue}, 75%, 52%)`
    if (!usedColors.has(color)) return color
  }
  return `hsl(${Math.round(abs % 360)}, 75%, 52%)`
}

// Month-to-date spend for the embedding / image / audio tabs, in the same card
// slot the chat tab uses for its budget bar.
//
// It is deliberately NOT a budget bar. Chat can draw a percentage because
// `models.monthly_token_budget` is a real number. `embedding_models` and
// `media_models` only carry a free-text `quota_label` — "10K neurons/day
// (shared)", "$0.10/mo credits", "MP3 output - multilingual" — and there is no
// honest conversion from Neurons or dollar credits to tokens, nor is the last
// one a quota at all. So the bar shows how spend is *distributed* across
// providers (which is real), the total is what was actually spent, and each
// provider's quota label is printed verbatim for the reader to judge.
export interface UsageRow {
  /** Family name for embeddings, model display name for media. */
  label: string
  platform: string | null
  quotaLabel?: string | null
  /**
   * Whichever unit this modality is metered in. `null` where the server does
   * not attribute usage per row — the /v1/fetch reader chain counts reads for
   * the box as a whole, so a reader's own share is genuinely unknown. Those
   * rows print an em dash and sit out the distribution bar rather than claim
   * a number the server never measured.
   */
  amount: number | null
  requestsToday: number
}

export function UsageSummaryCard({
  rows,
  total,
  requestsToday,
  unit,
}: {
  rows: UsageRow[]
  total: number
  requestsToday: number
  /** 'tokens' for embeddings, 'requests' for image/audio (billed per image or per character). */
  unit: 'tokens' | 'requests'
}) {
  const { t } = useI18n()

  // Calculate distinct colors for each row to prevent identical/twin colors
  const rowColors = useMemo(() => {
    const usedColors = new Set<string>()
    return rows.map((r) => {
      const defined = r.platform ? platformColors[r.platform] : undefined
      if (defined && !usedColors.has(defined)) {
        usedColors.add(defined)
        return defined
      }
      // If undefined or color already taken by another row in this card, deterministically pick/generate unique color
      const chosen = autoModelColor(r.platform || r.label, usedColors)
      usedColors.add(chosen)
      return chosen
    })
  }, [rows])

  const spent = useMemo(() => {
    return rows
      .map((r, i) => ({ ...r, color: rowColors[i] }))
      .filter((r): r is UsageRow & { amount: number; color: string } => (r.amount ?? 0) > 0)
  }, [rows, rowColors])

  const fmt = (n: number) => (unit === 'tokens' ? formatTokens(n) : String(n))

  return (
    <section className="rounded-3xl border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-medium">{t('models.usageThisMonth')}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {unit === 'tokens'
            ? t('embeddings.usageMonth', { count: fmt(total) })
            : t('models.usageRequestsMonth', { count: total })}
          <span className="mx-1.5">·</span>
          {t('embeddings.usageToday', { count: requestsToday })}
        </span>
      </div>

      {/* The track always renders. Hiding it at zero made the whole card read as
          missing on tabs with no traffic yet, which is exactly when a reader is
          checking whether the feature is there at all. A plain track also stands
          in when no row carries an amount (the fetch reader chain, whose reads
          are counted for the box rather than per reader): a distribution bar
          there would be inventing one. */}
      {total > 0 && spent.length > 0 ? (
        <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
          {spent.map((r, i) => (
            <div
              key={i}
              title={`${r.label}${r.platform ? ` (${r.platform})` : ''}: ${fmt(r.amount)}`}
              style={{
                width: `${(r.amount / total) * 100}%`,
                backgroundColor: r.color,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="h-2.5 rounded-full bg-muted" />
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-1.5 text-xs tabular-nums">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span
              className="size-2 rounded-sm flex-shrink-0"
              style={{ backgroundColor: rowColors[i] }}
            />
            <span className="truncate">{r.label}</span>
            {r.quotaLabel && (
              <span className="truncate text-muted-foreground/70 font-normal">{r.quotaLabel}</span>
            )}
            <span className="flex-1" />
            {r.amount === null
              ? (
                <span className="font-mono text-muted-foreground/50" title={t('models.usagePerSourceUnknown')}>—</span>
              )
              : <span className="font-mono text-muted-foreground">{fmt(r.amount)}</span>}
          </div>
        ))}
      </div>

      {total === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">{t('models.usageEmpty')}</p>
      )}
    </section>
  )
}
