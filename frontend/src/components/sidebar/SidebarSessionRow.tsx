import { MiddleTruncate } from '../MiddleTruncate'
import { useContextMenu } from '../../lib/useContextMenu'
import { SidebarSectionMenu, type SectionMenuItem } from './SidebarSectionMenu'

interface SidebarSessionRowProps {
  name: string
  active: boolean
  attached: boolean
  color?: string | null
  onClick: () => void
  contextMenuItems?: SectionMenuItem[]
}

export function SidebarSessionRow({ name, active, attached, color, onClick, contextMenuItems }: SidebarSessionRowProps) {
  const menu = useContextMenu()
  const hasContextMenu = contextMenuItems && contextMenuItems.length > 0

  return (
    <>
      <button
        className={`relative w-[calc(100%-12px)] mx-1.5 flex items-center gap-2 border-0 bg-transparent cursor-pointer px-3 py-1 text-left h-7 rounded-[6px] transition-[background,color] ${
          active
            ? 'bg-accent-soft text-foreground-strong'
            : attached
              ? 'text-foreground bg-elevated/35 hover:bg-elevated'
              : 'text-foreground-muted hover:bg-elevated/60 hover:text-foreground'
        }`}
        onClick={onClick}
        onContextMenu={hasContextMenu ? menu.onContextMenu : undefined}
        type="button"
        title={active ? `Active: ${name}` : attached ? `Switch to ${name}` : `Attach to ${name}`}
      >
        {active ? (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-[3px] rounded-r-full bg-accent" />
        ) : null}
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: attached ? color || '#3fb950' : 'var(--color-foreground-subtle)',
            boxShadow: attached ? `0 0 6px ${color || '#3fb950'}99` : 'none',
          }}
        />
        <MiddleTruncate text={name} className="flex-1 text-xs leading-none" />
      </button>
      {hasContextMenu && menu.open ? (
        <SidebarSectionMenu items={contextMenuItems} position={menu.position} innerRef={menu.ref} onClose={menu.close} />
      ) : null}
    </>
  )
}
