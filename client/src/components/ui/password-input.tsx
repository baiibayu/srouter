import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Password field with a show/hide toggle. Wraps the shared Input so the base
// styling stays in one place; only the trailing icon button and the extra
// right padding are added here. The toggle is a real <button type="button">
// so it never submits the form, and it carries an aria-label so screen readers
// announce its purpose rather than reading the icon glyph.
export function PasswordInput({
  className,
  label,
  ...props
}: React.ComponentProps<typeof Input> & { label?: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={cn('pe-9', className)}
        aria-label={label}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? `Hide ${label ?? 'password'}` : `Show ${label ?? 'password'}`}
        aria-pressed={visible}
        className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  )
}
