import { Play, Terminal } from 'lucide-react'
import { main } from '../../../wailsjs/go/models'
import { useContextMenu } from '../../lib/useContextMenu'
import { IconButton } from '../button/IconButton'
import { MiddleTruncate } from '../MiddleTruncate'
import { SidebarSectionMenu, type SectionMenuItem } from './SidebarSectionMenu'

interface SidebarSnippetRowProps {
  snippet: main.Snippet
  onOpen: () => void
  onRun: () => void
  contextMenuItems?: SectionMenuItem[]
}

export function SidebarSnippetRow({ snippet, onOpen, onRun, contextMenuItems }: SidebarSnippetRowProps) {
  const destination = snippet.tab === 'new-tab' ? snippet.target || 'new tab' : null
  const menu = useContextMenu()
  const hasContextMenu = contextMenuItems && contextMenuItems.length > 0

  return (
    <>
      <div
        className="group relative w-[calc(100%-12px)] mx-1.5 flex items-center gap-2 cursor-pointer px-2 py-1 h-7 rounded-[6px] text-foreground-muted transition-[background,color] hover:bg-elevated/60 hover:text-foreground"
        onClick={onOpen}
        onContextMenu={hasContextMenu ? menu.onContextMenu : undefined}
        title="Edit snippet"
      >
        <Terminal size={11} strokeWidth={1.8} className="flex-shrink-0 text-foreground-subtle" />
        <MiddleTruncate text={snippet.name} className="flex-1 text-xs leading-none" />
        {destination ? (
          <span className="shrink-0 text-foreground-subtle bg-elevated/80 border border-border/60 rounded-full px-1.5 text-[10px] leading-4 normal-case group-hover:hidden">
            {destination}
          </span>
        ) : null}
        <IconButton
          icon={<Play size={12} strokeWidth={1.8} />}
          title={destination ? `Run in new tab (${destination})` : 'Run in current tab'}
          size={16}
          className="hidden group-hover:inline-flex text-foreground-subtle hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            onRun()
          }}
        />
      </div>
      {hasContextMenu && menu.open ? (
        <SidebarSectionMenu items={contextMenuItems} position={menu.position} innerRef={menu.ref} onClose={menu.close} />
      ) : null}
    </>
  )
}
