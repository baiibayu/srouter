import { useState, useMemo } from 'react'
import { Dialog, DialogClose, DialogPopup, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/i18n'
import { platformLabel } from '@/lib/platform-label'
import {
  Check,
  ChevronDown,
  CircleAlert,
  Minus,
  Plus,
  RefreshCcw,
  X,
} from 'lucide-react'

/* ──────────────────────────── types ──────────────────────────── */

/** Per-platform result from POST /api/keys/refresh-all-models */
export interface SyncPlatformResult {
  platform: string
  registered: number
  refreshed: number
  retired: number
  modelsAvailable: number
  previousModelsAvailable: number
  newModels: string[]
  updatedModels: string[]
  retiredModels: string[]
  error?: string
}

export interface SyncAllResult {
  platforms: number
  totalRegistered: number
  totalRefreshed: number
  totalRetired: number
  catalogSync?: { inserted?: number; removed?: number; updated?: number }
  results: SyncPlatformResult[]
}

/* ──────────────────────────── helpers ──────────────────────────── */
// platformLabel() lives in @/lib/platform-label — shared with the
// notification bell so a provider is never named two different ways.

/* ─────────── small helper: model name badge (truncated) ──────── */

function ModelBadge({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  return (
    <span
      className={`inline-block max-w-full truncate rounded-md border px-2 py-0.5 text-[11px] leading-tight font-mono ${className ?? ''}`}
      title={name}
    >
      {name}
    </span>
  )
}

/* ────────────────────── main component ───────────────────────── */

export function SyncAllResultsDialog({
  open,
  onOpenChange,
  result,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: SyncAllResult | null
}) {
  const { t } = useI18n()

  // Auto-expand platforms that have errors
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(() => {
    if (!result) return new Set()
    return new Set(result.results.filter((r) => r.error).map((r) => r.platform))
  })

  // Sort: errors first → changes → alphabetical.
  // NOTE: hooks must ALL be declared before any early return to satisfy
  // React's rules-of-hooks (#310).
  const sorted = useMemo(() => {
    return [...(result?.results ?? [])].sort((a, b) => {
      if (a.error && !b.error) return -1
      if (!a.error && b.error) return 1
      const aTotal = a.registered + a.refreshed + a.retired
      const bTotal = b.registered + b.refreshed + b.retired
      if (aTotal > 0 && bTotal === 0) return -1
      if (aTotal === 0 && bTotal > 0) return 1
      return a.platform.localeCompare(b.platform)
    })
  }, [result?.results])

  if (!result) return null

  const toggle = (platform: string) => {
    setExpandedPlatforms((prev) => {
      const next = new Set(prev)
      if (next.has(platform)) next.delete(platform)
      else next.add(platform)
      return next
    })
  }

  const changedCount = result.results.filter(
    (r) => r.registered + r.refreshed + r.retired > 0,
  ).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup maxWidth="max-w-2xl" className="flex flex-col gap-0 p-0">
        {/* ── Header ────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <DialogTitle>{t('keys.syncAllDialogTitle')}</DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {t('keys.syncAllDialogSummary', {
                changed: changedCount,
                total: result.platforms,
              })}
            </p>
          </div>
          <DialogClose
            aria-label={t('common.dismiss')}
            className="-mr-1 -mt-0.5 shrink-0 rounded-lg p-1.5 text-muted-foreground/60 transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </DialogClose>
        </div>

        {/* ── Summary badges ─────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5 px-5 pt-3 sm:px-6">
          {result.catalogSync && (result.catalogSync.inserted ?? 0) + (result.catalogSync.removed ?? 0) + (result.catalogSync.updated ?? 0) > 0 && (
            <Badge variant="default" className="gap-1 border-0 bg-blue-600 hover:bg-blue-600">
              <RefreshCcw className="size-3" />
              {t('keys.syncAllCatalog', {
                inserted: result.catalogSync.inserted ?? 0,
                removed: result.catalogSync.removed ?? 0,
                updated: result.catalogSync.updated ?? 0,
              })}
            </Badge>
          )}
          {result.totalRegistered > 0 && (
            <Badge variant="default" className="gap-1 border-0 bg-emerald-600 hover:bg-emerald-600">
              <Plus className="size-3" />
              {t('keys.syncAllNew', { count: result.totalRegistered })}
            </Badge>
          )}
          {result.totalRefreshed > 0 && (
            <Badge variant="default" className="gap-1 border-0 bg-amber-500 hover:bg-amber-500">
              <RefreshCcw className="size-3" />
              {t('keys.syncAllUpdated', { count: result.totalRefreshed })}
            </Badge>
          )}
          {result.totalRetired > 0 && (
            <Badge variant="default" className="gap-1 border-0 bg-red-500 hover:bg-red-500">
              <Minus className="size-3" />
              {t('keys.syncAllRetired', { count: result.totalRetired })}
            </Badge>
          )}
          {result.totalRegistered === 0 &&
            result.totalRefreshed === 0 &&
            result.totalRetired === 0 && (
              <Badge variant="secondary" className="gap-1">
                <Check className="size-3" />
                {t('keys.syncAllNoChanges')}
              </Badge>
            )}
        </div>

        {/* ── Divider ────────────────────────────── */}
        <div className="mx-5 mt-3 h-px bg-border sm:mx-6" />

        {/* ── Per-platform list ──────────────────── */}
        <div className="mx-5 mt-3 max-h-[50vh] min-h-[3rem] space-y-1.5 overflow-y-auto sm:mx-6">
          {sorted.map((r) => {
            const hasChanges = r.registered + r.refreshed + r.retired > 0
            const hasError = !!r.error
            const expanded = expandedPlatforms.has(r.platform)
            const hasDetails =
              r.newModels.length > 0 ||
              r.updatedModels.length > 0 ||
              r.retiredModels.length > 0

            const cardBg = hasError
              ? 'bg-red-50 dark:bg-red-950/30'
              : hasChanges
                ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                : 'bg-muted/30 hover:bg-muted/50'
            const cardBorder = hasError
              ? 'border-red-200 dark:border-red-800/60'
              : hasChanges
                ? 'border-emerald-200/70 dark:border-emerald-800/40'
                : 'border-border/60'

            return (
              <div
                key={r.platform}
                className={`group rounded-xl border transition-all duration-150 ${cardBg} ${cardBorder}`}
              >
                {/* ─ platform header row ─ */}
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left sm:gap-3 sm:px-4 sm:py-3 ${
                    hasDetails ? 'cursor-pointer' : 'cursor-default'
                  }`}
                  onClick={() => hasDetails && toggle(r.platform)}
                  disabled={!hasDetails}
                >
                  {hasDetails ? (
                    <ChevronDown
                      className={`size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200 sm:size-4 ${
                        expanded ? 'rotate-180' : ''
                      }`}
                    />
                  ) : (
                    <span className="size-3.5 sm:size-4" />
                  )}

                  <span className="min-w-0 truncate text-xs font-medium sm:text-sm">
                    {platformLabel(r.platform)}
                  </span>

                  <span className="flex-1" />

                  {/* status badges */}
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {hasError && (
                      <Badge variant="destructive" className="gap-1 text-[10px] sm:text-xs">
                        <CircleAlert className="size-3" />
                        Error
                      </Badge>
                    )}
                    {r.registered > 0 && (
                      <Badge variant="default" className="gap-1 border-0 bg-emerald-600 text-[10px] hover:bg-emerald-600 sm:text-xs">
                        <Plus className="size-3" />
                        {r.registered} new
                      </Badge>
                    )}
                    {r.refreshed > 0 && (
                      <Badge variant="default" className="gap-1 border-0 bg-amber-500 text-[10px] hover:bg-amber-500 sm:text-xs">
                        <RefreshCcw className="size-3" />
                        {r.refreshed} updated
                      </Badge>
                    )}
                    {r.retired > 0 && (
                      <Badge variant="default" className="gap-1 border-0 bg-red-500 text-[10px] hover:bg-red-500 sm:text-xs">
                        <Minus className="size-3" />
                        {r.retired} retired
                      </Badge>
                    )}
                    {!hasChanges && !hasError && (
                      <span className="text-[10px] text-muted-foreground sm:text-xs">
                        {r.modelsAvailable} live
                      </span>
                    )}
                  </div>
                </button>

                {/* expandable model details */}
                {expanded && hasDetails && (
                  <div className="border-t border-border/40 px-3 pb-2.5 pt-2 sm:px-4">
                    {r.newModels.length > 0 && (
                      <div className="mb-2">
                        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          {t('keys.syncAllNewModels')} ({r.newModels.length})
                        </span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.newModels.map((m) => (
                            <ModelBadge key={m} name={m} className="border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400" />
                          ))}
                        </div>
                      </div>
                    )}
                    {r.updatedModels.length > 0 && (
                      <div className="mb-2">
                        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          {t('keys.syncAllUpdatedModels')} ({r.updatedModels.length})
                        </span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.updatedModels.map((m) => (
                            <ModelBadge key={m} name={m} className="border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-400" />
                          ))}
                        </div>
                      </div>
                    )}
                    {r.retiredModels.length > 0 && (
                      <div>
                        <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                          {t('keys.syncAllRetiredModels')} ({r.retiredModels.length})
                        </span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.retiredModels.map((m) => (
                            <ModelBadge key={m} name={m} className="border-red-200 text-red-600 line-through dark:border-red-800 dark:text-red-400" />
                          ))}
                        </div>
                      </div>
                    )}
                    {r.error && (
                      <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-400">
                        {r.error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Footer ────────────────────────────── */}
        <div className="flex items-center justify-end border-t border-border/40 px-5 py-3 sm:px-6">
          <DialogClose className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.97]">
            {t('keys.syncAllDialogClose')}
          </DialogClose>
        </div>
      </DialogPopup>
    </Dialog>
  )
}
