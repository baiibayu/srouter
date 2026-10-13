import type { ReactNode } from 'react'
import { Info, type LucideIcon } from 'lucide-react'
import { Tooltip } from '@/components/tooltip'

// Small info affordance used next to labels a first-time user can't be expected
// to understand. It's a real <button> so it reaches the tooltip by keyboard
// (the shared Tooltip opens on focus as well as hover); self-evident settings
// like language and theme deliberately have none.
export function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip text={text}>
      <button
        type="button"
        aria-label={text}
        onClick={event => event.preventDefault()}
        className="inline-flex rounded-full text-muted-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Info className="size-3.5" />
      </button>
    </Tooltip>
  )
}

// One settings row: label (plus optional info hint) on the start edge, control
// on the end edge, stacking on narrow widths. Every row in the dialog uses this
// so labels, spacing and alignment stay identical across sections.
export function Row({
  label,
  hint,
  control,
  children,
}: {
  label: string
  hint?: string
  /** Inline control, aligned with the label. */
  control?: ReactNode
  /** Full-width control rendered under the label. */
  children?: ReactNode
}) {
  return (
    <div className="border-b border-border/60 py-4 last:border-b-0 last:pb-0">
      <div className={control ? 'flex flex-wrap items-center justify-between gap-x-6 gap-y-2' : 'space-y-2.5'}>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{label}</span>
          {hint && <InfoHint text={hint} />}
        </div>
        {control ?? children}
      </div>
    </div>
  )
}

export function SectionHeader({ title, description, hint }: { title: string; description?: string; hint?: string }) {
  return (
    <div className="mb-5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <h2 className="font-heading text-base leading-snug font-medium">{title}</h2>
        {hint && <InfoHint text={hint} />}
      </div>
      {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  )
}

// Shared pill-bar idiom (same visual as SegmentedControl, with room for icons).
export function OptionBar<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
}: {
  value: T
  onValueChange: (value: T) => void
  options: Array<{ value: T; label: string; icon?: LucideIcon }>
  ariaLabel: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`grid gap-1 rounded-xl border p-1 ${className ?? ''}`}>
      {options.map(option => {
        const Icon = option.icon
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onValueChange(option.value)}
            className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors ${
              selected
                ? 'bg-primary font-medium text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {Icon && <Icon className="size-3.5 shrink-0" />}
            <span className="truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

