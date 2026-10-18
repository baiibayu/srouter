import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
  tabs,
  divider = true,
}: {
  title: string
  description?: string
  actions?: ReactNode
  tabs?: ReactNode
  divider?: boolean
}) {
  return (
    <div className={`mb-4 sm:mb-6 ${divider ? 'pb-4 sm:pb-6 border-b' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground sm:mt-1 sm:text-sm">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {actions}
          </div>
        )}
      </div>
      {tabs && (
        <div className="mt-3 max-w-full overflow-x-auto">
          {tabs}
        </div>
      )}
    </div>
  )
}
