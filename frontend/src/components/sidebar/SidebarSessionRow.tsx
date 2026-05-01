import { MiddleTruncate } from '../MiddleTruncate'

interface SidebarSessionRowProps {
  name: string
  active: boolean
  attached: boolean
  color?: string | null
  onClick: () => void
}

export function SidebarSessionRow({ name, active, attached, color, onClick }: SidebarSessionRowProps) {
  return (
    <button
      className={`w-full flex items-center gap-2 border-0 bg-transparent cursor-pointer px-3 py-1 text-left h-[26px] border-l-2 ${
        active
          ? 'bg-muted border-l-accent text-foreground-strong'
          : attached
            ? 'text-foreground border-l-transparent hover:bg-elevated bg-elevated/40'
            : 'text-foreground border-l-transparent hover:bg-elevated'
      }`}
      onClick={onClick}
      type="button"
      title={active ? `Active: ${name}` : attached ? `Switch to ${name}` : `Attach to ${name}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: attached ? color || '#3fb950' : 'var(--color-foreground-subtle)',
          boxShadow: attached ? `0 0 6px ${color || '#3fb950'}99` : 'none',
        }}
      />
      <MiddleTruncate text={name} className="flex-1 text-xs" />
    </button>
  )
}
