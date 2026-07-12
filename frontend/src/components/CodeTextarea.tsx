import { useMemo, useRef } from 'react'

interface CodeTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  rows?: number
}

// A monospace textarea with a line-number gutter and Tab-to-indent, without
// pulling in a full code-editor dependency for what is just shell scripts.
export function CodeTextarea({ value, onChange, placeholder, className = '', rows = 10 }: CodeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const gutterRef = useRef<HTMLDivElement | null>(null)
  const lineCount = useMemo(() => value.split('\n').length, [value])

  const syncGutterScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  return (
    <div
      className={`flex bg-background/60 border border-border rounded-[6px] overflow-hidden font-mono text-[12px] leading-[1.5] ${className}`}
    >
      <div
        ref={gutterRef}
        className="select-none text-right text-foreground-subtle/70 bg-elevated/30 px-2 py-2 overflow-hidden"
        style={{ minWidth: `${String(lineCount).length + 2}ch` }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="flex-1 min-w-0 bg-transparent border-0 outline-0 resize-none px-2 py-2 text-foreground-strong placeholder:text-foreground-subtle whitespace-pre overflow-x-auto"
        value={value}
        placeholder={placeholder}
        rows={rows}
        wrap="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncGutterScroll}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          event.preventDefault()
          const el = event.currentTarget
          const start = el.selectionStart
          const end = el.selectionEnd
          const next = `${value.slice(0, start)}\t${value.slice(end)}`
          onChange(next)
          window.requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = start + 1
          })
        }}
      />
    </div>
  )
}
