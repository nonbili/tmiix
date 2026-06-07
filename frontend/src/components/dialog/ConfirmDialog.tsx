import { useValue } from '@legendapp/state/react'
import { useEffect, useRef } from 'react'
import { resolveConfirm, ui$ } from '../../state/ui'

export function ConfirmDialog() {
  const confirm = useValue(ui$.confirm)
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!confirm.open) return
    window.setTimeout(() => confirmRef.current?.focus(), 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        resolveConfirm(false)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        resolveConfirm(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirm.open])

  if (!confirm.open) return null

  return (
    <div
      className="fixed inset-0 grid place-items-center z-50 bg-overlay backdrop-blur-sm px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) resolveConfirm(false)
      }}
    >
      <div
        className="relative w-full max-w-[400px] bg-surface border border-border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in duration-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6">
          {confirm.title ? (
            <h2 className="text-base font-semibold text-foreground-strong mb-2">{confirm.title}</h2>
          ) : null}
          <p className="text-sm text-foreground-subtle leading-relaxed">{confirm.message}</p>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              onClick={() => resolveConfirm(false)}
              className="py-2 px-4 bg-elevated hover:bg-muted border border-border rounded-lg text-sm text-foreground hover:text-foreground-strong transition-colors"
            >
              {confirm.cancelLabel}
            </button>
            <button
              ref={confirmRef}
              onClick={() => resolveConfirm(true)}
              className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                confirm.destructive
                  ? 'bg-term-red/15 hover:bg-term-red/25 text-term-red border border-term-red/30'
                  : 'bg-accent hover:bg-accent/90 text-background border border-transparent'
              }`}
            >
              {confirm.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
