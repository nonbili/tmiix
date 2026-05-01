import { useValue } from '@legendapp/state/react'
import { useContextMenu } from '../../lib/useContextMenu'
import { sessions$, refreshSessions } from '../../state/sessions'
import { attachSession, getActiveSession, getAttachedSessions, openLocalShell, syncLocalTabColors, tabs$ } from '../../state/tabs'
import { setLocalColor, ui$ } from '../../state/ui'
import { sidebar$, toggleLocalExpanded } from '../../state/sidebar'
import { SidebarSectionHeader } from './SidebarSectionHeader'
import { SidebarSectionMenu, type SectionMenuItem } from './SidebarSectionMenu'
import { SidebarSessionRow } from './SidebarSessionRow'

export function SidebarLocalHeader() {
  const localColor = useValue(ui$.localColor)
  const sessions = useValue(sessions$.items)
  const localExpanded = useValue(sidebar$.localExpanded)
  const menu = useContextMenu()

  const items: SectionMenuItem[] = [
    { kind: 'button', label: 'Open Shell', onClick: () => void openLocalShell() },
    {
      kind: 'colors',
      value: localColor || undefined,
      onChange: (color) => {
        setLocalColor(color || null)
        syncLocalTabColors()
      },
    },
  ]

  return (
    <>
      <SidebarSectionHeader
        title="Local"
        expanded={localExpanded}
        count={sessions.length}
        color={localColor || undefined}
        status="connected"
        onToggle={toggleLocalExpanded}
        onRefresh={() => void refreshSessions()}
        onContextMenu={menu.onContextMenu}
      />
      {menu.open ? (
        <SidebarSectionMenu items={items} position={menu.position} innerRef={menu.ref} onClose={menu.close} />
      ) : null}
    </>
  )
}

export function SidebarLocalSessions() {
  const localColor = useValue(ui$.localColor)
  const sessions = useValue(sessions$.items)
  const localExpanded = useValue(sidebar$.localExpanded)
  useValue(tabs$.items)
  const attachedSessions = getAttachedSessions()
  const activeSession = getActiveSession()

  if (!localExpanded) return null

  return (
    <div className="py-1">
      {sessions.length === 0 ? (
        <div className="px-3 py-4 text-foreground-subtle text-xs leading-[1.6]">
          <div>No tmux sessions detected.</div>
          <div className="mt-2">
            Start one with{' '}
            <code className="text-foreground bg-elevated border border-border rounded-[3px] px-1 py-px text-[11px]">
              tmux new -s name
            </code>
          </div>
        </div>
      ) : (
        sessions.map((sessionName) => (
          <SidebarSessionRow
            key={sessionName}
            name={sessionName}
            active={activeSession === sessionName}
            attached={attachedSessions.has(sessionName)}
            color={localColor}
            onClick={() => void attachSession(sessionName)}
          />
        ))
      )}
    </div>
  )
}
