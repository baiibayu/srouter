import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Tooltip } from '@/components/tooltip'

// Headline number card + titled content shell, shared by the Analytics page
// and the Dashboard home. Extracted from AnalyticsPage so both pages render
// the same stat row without importing (and bundling) each other's route.
export function Stat({
  icon: Icon,
  label,
  value,
  sub,
  hint,
  className,
}: {
  icon: LucideIcon
  label: string
  value: string | number
  sub?: ReactNode
  hint?: string
  className?: string
}) {
  const card = (
    // h-full: when a hint wraps the card, the wrapper is the grid item and
    // only stretches itself — without this the hinted card's border renders
    // shorter than its hint-less siblings (and vice versa in flex rows).
    <div className="h-full rounded-3xl border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
      </div>
      <p className={`text-xl font-semibold tabular-nums mt-1 ${className ?? ''}`}>{value}</p>
      {/* Optional second figure, so one card can carry two related numbers
          instead of spending another slot in the summary row. */}
      {sub ? <p className="text-[11px] text-muted-foreground tabular-nums truncate">{sub}</p> : null}
    </div>
  )
  // Same portal tooltip as the routing strategy chips. Opens BELOW the card:
  // the stats row sits right under the sticky navbar.
  return hint ? <Tooltip text={hint} side="bottom" className="block h-full">{card}</Tooltip> : card
}

export function Panel({
  icon: Icon,
  title,
  actions,
  children,
}: {
  icon: LucideIcon
  title: string
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="rounded-3xl border bg-card">
      <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </h3>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}
