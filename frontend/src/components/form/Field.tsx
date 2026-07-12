import { forwardRef } from 'react'

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] text-foreground-subtle mb-1">{children}</label>
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full h-7 bg-elevated border border-border rounded-[6px] px-2.5 text-xs text-foreground-strong outline-0 focus:border-accent-muted ${className ?? ''}`}
        {...props}
      />
    )
  },
)

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      // Native selects inset their text ~4px beyond the CSS padding, so use a
      // smaller left padding than TextInput to keep the text aligned.
      className={`w-full h-7 bg-elevated border border-border rounded-[6px] pl-1.5 pr-2.5 text-xs text-foreground-strong outline-0 focus:border-accent-muted ${className ?? ''}`}
      {...props}
    />
  )
}
