import { useEffect, useState, type ReactNode } from 'react'

// Viewport-fixed action bar that slides up when shown and — instead of
// vanishing — slides back down before unmounting (kept in the tree for the
// duration of the exit animation).
export function FloatingBar({ show, children }: { show: boolean; children: ReactNode }) {
  const [render, setRender] = useState(show)
  useEffect(() => {
    if (show) {
      setRender(true)
      return
    }
    const t = setTimeout(() => setRender(false), 300) // match animation duration
    return () => clearTimeout(t)
  }, [show])
  if (!render) return null
  return (
    <div
      className={`fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none duration-300 sm:bottom-6 sm:px-6 ${
        show
          ? 'animate-in slide-in-from-bottom-4 fade-in'
          : 'animate-out slide-out-to-bottom-4 fade-out fill-mode-forwards'
      }`}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border bg-card px-3 py-1.5 shadow-lg ring-1 ring-foreground/5 sm:gap-3 sm:rounded-full sm:px-4 sm:py-2">
        {children}
      </div>
    </div>
  )
}
