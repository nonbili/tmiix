import { isMac } from '../lib/keybindings'

interface KbdShortcutProps {
  parts: string[]
  className?: string
}

const MAC_MODIFIERS = new Set(['⌘', '⌃', '⌥', '⇧'])

export function KbdShortcut({ parts, className = '' }: KbdShortcutProps) {
  return (
    <kbd className={className}>
      {parts.map((part, idx) => {
        const modifier = isMac && MAC_MODIFIERS.has(part)
        return (
          <span key={`${part}-${idx}`} className={modifier ? 'text-[1.35em] leading-none align-[-0.08em]' : undefined}>
            {idx > 0 ? '+' : null}
            {part}
          </span>
        )
      })}
    </kbd>
  )
}
