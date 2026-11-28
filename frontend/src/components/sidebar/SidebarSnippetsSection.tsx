import { useValue } from '@legendapp/state/react'
import { FolderOpen, Plus, RefreshCw } from 'lucide-react'
import { OpenSnippetsDir } from '../../../bindings/tmiix/app'
import { openCreateRunbookDialog, refreshSnippets, snippetEditor$, snippets$ } from '../../state/snippets'
import { IconButton } from '../button/IconButton'
import { SidebarRunbookSection } from './SidebarRunbookSection'
import { SnippetEditorPane } from './SnippetEditorPane'

export function SidebarSnippetsSection() {
  const runbooks = useValue(snippets$.runbooks)
  const editorOpen = useValue(snippetEditor$.open)

  if (editorOpen) {
    return <SnippetEditorPane />
  }

  return (
    <div data-section="snippets" className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between h-8 pl-[14px] pr-2 border-b border-border/80 text-foreground-subtle text-[11px] uppercase tracking-[0.08em] bg-elevated/40 shrink-0">
        <span>Snippets</span>
        <div className="flex items-center gap-2">
          <IconButton
            icon={<Plus size={14} strokeWidth={1.7} />}
            title="New runbook"
            size={16}
            className="text-foreground-subtle hover:text-foreground"
            onClick={openCreateRunbookDialog}
          />
          <IconButton
            icon={<RefreshCw size={14} strokeWidth={1.7} />}
            title="Reload snippets"
            size={16}
            className="text-foreground-subtle hover:text-foreground"
            onClick={() => void refreshSnippets()}
          />
          <IconButton
            icon={<FolderOpen size={14} strokeWidth={1.7} />}
            title="Show in folder"
            size={16}
            className="text-foreground-subtle hover:text-foreground"
            onClick={() => void OpenSnippetsDir()}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {runbooks.length === 0 ? (
          <div className="mx-1.5 my-2 rounded-[6px] border border-border/70 bg-background/30 px-3 py-2.5 text-foreground-subtle text-xs leading-[1.55]">
            No runbooks yet. Use the + button above to create one.
          </div>
        ) : (
          runbooks.map((runbook) => <SidebarRunbookSection key={runbook.name} runbook={runbook} />)
        )}
      </div>
    </div>
  )
}
