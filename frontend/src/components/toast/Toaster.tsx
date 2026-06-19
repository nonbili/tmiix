import { useValue } from '@legendapp/state/react'
import { X } from 'lucide-react'
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
            className={`flex items-start gap-2.5 px-3 py-2.5 rounded-[8px] border border-border/90 border-l-4 ${accent} bg-surface shadow-[0_18px_48px_rgba(0,0,0,0.34)] text-foreground text-[13px] animate-in slide-in-from-right-2 duration-150`}
          >
            <span
              className="mt-1.5 w-[7px] h-[7px] rounded-full flex-shrink-0"
              style={{ backgroundColor: dot, boxShadow: `0 0 10px ${dot}99` }}
            />
            <span className="flex-1 min-w-0 break-words">{toast.message}</span>
            <button
              className="inline-flex h-5 w-5 items-center justify-center rounded-[4px] text-foreground-subtle hover:text-foreground-strong hover:bg-muted bg-transparent border-0 cursor-pointer"
              onClick={() => dismissToast(toast.id)}
              type="button"
              aria-label="Dismiss"
            >
              <X size={13} strokeWidth={1.8} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
