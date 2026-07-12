import { useValue } from '@legendapp/state/react'
import { NotebookText, Plus } from 'lucide-react'
import { main } from '../../../wailsjs/go/models'
import { IconButton } from '../button/IconButton'
import { useContextMenu } from '../../lib/useContextMenu'
import {
  deleteRunbook,
  deleteSnippet,
  openCreateSnippetEditor,
  openEditRunbookDialog,
  openEditSnippetEditor,
  runSnippet,
  snippets$,
  toggleRunbook,
} from '../../state/snippets'
import { SidebarSectionHeader } from './SidebarSectionHeader'
import { SidebarSectionMenu, type SectionMenuItem } from './SidebarSectionMenu'
import { SidebarSnippetRow } from './SidebarSnippetRow'

interface SidebarRunbookSectionProps {
  runbook: main.Runbook
}

export function SidebarRunbookSection({ runbook }: SidebarRunbookSectionProps) {
  const expanded = useValue(snippets$.expanded[runbook.name]) ?? false
  const menu = useContextMenu()

  const menuItems: SectionMenuItem[] = [
    { kind: 'button', label: 'New snippet', onClick: () => openCreateSnippetEditor(runbook.name) },
    { kind: 'button', label: 'Edit runbook', onClick: () => openEditRunbookDialog(runbook) },
    { kind: 'button', label: 'Delete runbook', danger: true, onClick: () => void deleteRunbook(runbook.name) },
  ]

  return (
    <div>
      <SidebarSectionHeader
        title={runbook.name}
        expanded={expanded}
        icon={<NotebookText size={12} strokeWidth={1.7} />}
        onToggle={() => toggleRunbook(runbook.name)}
        onContextMenu={menu.onContextMenu}
        rightSlot={
          <IconButton
            icon={<Plus size={14} strokeWidth={1.7} />}
            title="New snippet"
            size={16}
            className="opacity-0 group-hover:opacity-100 text-foreground-subtle hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              openCreateSnippetEditor(runbook.name)
            }}
          />
        }
      />

      {menu.open ? (
        <SidebarSectionMenu items={menuItems} position={menu.position} innerRef={menu.ref} onClose={menu.close} />
      ) : null}

      {expanded ? (
        <div className="py-1.5">
          {runbook.snippets.length === 0 ? (
            <div className="mx-1.5 my-1 rounded-[6px] border border-border/70 bg-background/35 px-3 py-2 text-foreground-subtle text-[11px]">
              No snippets.
            </div>
          ) : (
            runbook.snippets.map((snippet) => (
              <SidebarSnippetRow
                key={snippet.name}
                snippet={snippet}
                onOpen={() => openEditSnippetEditor(snippet)}
                onRun={() => void runSnippet(snippet)}
                contextMenuItems={[
                  { kind: 'button', label: 'Run', onClick: () => void runSnippet(snippet) },
                  { kind: 'button', label: 'Edit', onClick: () => openEditSnippetEditor(snippet) },
                  { kind: 'button', label: 'Delete', danger: true, onClick: () => void deleteSnippet(snippet) },
                ]}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
