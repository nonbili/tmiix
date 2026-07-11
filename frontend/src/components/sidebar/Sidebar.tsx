import { useMemo } from 'react'
import { useValue } from '@legendapp/state/react'
import { FileCode2, Terminal } from 'lucide-react'
import { useContextMenu } from '../../lib/useContextMenu'
import { getKnownServers, servers$ } from '../../state/servers'
import { addServerFromCommand, revealServer } from '../../state/sidebar'
import { closeRemotePalette, openRemotePalette, setSidebarView, ui$ } from '../../state/ui'
import { RemoteServerPalette } from '../palette/RemoteServerPalette'
import { SidebarLocalHeader, SidebarLocalSessions } from './SidebarLocalSection'
import { SidebarSectionMenu, type SectionMenuItem } from './SidebarSectionMenu'
import { SidebarServerSection } from './SidebarServerSection'
import { SidebarSnippetsSection } from './SidebarSnippetsSection'

export function Sidebar() {
  const collapsed = useValue(ui$.sidebarCollapsed)
  const view = useValue(ui$.sidebarView)
  const servers = useValue(servers$.items)
  const configHosts = useValue(servers$.configHosts)
  const remotePaletteOpen = useValue(ui$.remotePalette.open)
  const remotePaletteConnectMode = useValue(ui$.remotePalette.connectMode)
  const menu = useContextMenu()

  const knownServers = useMemo(() => getKnownServers(), [configHosts, servers])

  const menuItems: SectionMenuItem[] = [
    { kind: 'button', label: 'Connect to new server', onClick: () => openRemotePalette(false) },
  ]

  return (
    <>
      <aside
        className={`flex flex-col bg-surface/96 border-r border-border min-w-0 overflow-hidden transition-[opacity,border-color] duration-[120ms] ease-in-out ${
          collapsed ? 'opacity-0 pointer-events-none border-r-transparent w-0' : 'w-[260px] max-[720px]:w-[220px] max-[480px]:w-[180px]'
        }`}
      >
        {view === 'sessions' ? (
          <>
            <SidebarLocalHeader />
            <div className="flex-1 overflow-auto" onContextMenu={menu.onContextMenu}>
              <SidebarLocalSessions />

              <div data-section="servers">
                {servers.map((srv) => (
                  <SidebarServerSection key={srv.name} server={srv} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <SidebarSnippetsSection />
          </div>
        )}

        <div className="flex border-t border-border shrink-0">
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 h-9 border-0 border-t-2 cursor-pointer text-[11px] uppercase tracking-[0.06em] transition-colors -mt-px ${
              view === 'sessions'
                ? 'border-t-accent bg-accent-soft text-accent'
                : 'border-t-transparent bg-transparent text-foreground-subtle hover:text-foreground hover:bg-elevated/30'
            }`}
            onClick={() => setSidebarView('sessions')}
            type="button"
          >
            <Terminal size={13} strokeWidth={1.8} />
            Sessions
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 h-9 border-0 border-t-2 border-l border-l-border cursor-pointer text-[11px] uppercase tracking-[0.06em] transition-colors -mt-px ${
              view === 'snippets'
                ? 'border-t-accent bg-accent-soft text-accent'
                : 'border-t-transparent bg-transparent text-foreground-subtle hover:text-foreground hover:bg-elevated/30'
            }`}
            onClick={() => setSidebarView('snippets')}
            type="button"
          >
            <FileCode2 size={13} strokeWidth={1.8} />
            Snippets
          </button>
        </div>
      </aside>

      {menu.open ? (
        <SidebarSectionMenu
          items={menuItems}
          position={menu.position}
          innerRef={menu.ref}
          onClose={menu.close}
        />
      ) : null}

      <RemoteServerPalette
        open={remotePaletteOpen}
        initialConnectMode={remotePaletteConnectMode}
        servers={knownServers}
        onClose={closeRemotePalette}
        onSelectServer={revealServer}
        onSubmitCommand={addServerFromCommand}
      />
    </>
  )
}
