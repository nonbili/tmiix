import { useValue } from '@legendapp/state/react'
import { dismissToast, toasts$ } from '../../state/toasts'

export function Toaster() {
  const items = useValue(toasts$.items)
  if (items.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-[min(360px,calc(100vw-32px))]">
      {items.map((toast) => {
        const accent =
          toast.kind === 'success'
            ? 'border-l-term-green'
            : toast.kind === 'error'
              ? 'border-l-term-red'
              : toast.kind === 'warning'
                ? 'border-l-term-yellow'
                : 'border-l-accent'
        const dot =
          toast.kind === 'success'
            ? 'var(--color-term-green)'
            : toast.kind === 'error'
              ? 'var(--color-term-red)'
              : toast.kind === 'warning'
                ? 'var(--color-term-yellow)'
                : 'var(--color-accent)'
        return (
          <div
            key={toast.id}
            role="status"
            className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-border border-l-4 ${accent} bg-surface shadow-[0_18px_60px_rgba(0,0,0,0.30)] text-foreground text-[13px] animate-in slide-in-from-right-2 duration-150`}
          >
            <span
              className="mt-1.5 w-[7px] h-[7px] rounded-full flex-shrink-0"
              style={{ backgroundColor: dot, boxShadow: `0 0 10px ${dot}99` }}
            />
            <span className="flex-1 min-w-0 break-words">{toast.message}</span>
            <button
              className="text-foreground-subtle hover:text-foreground-strong bg-transparent border-0 cursor-pointer text-[14px] leading-none px-1"
              onClick={() => dismissToast(toast.id)}
              type="button"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
