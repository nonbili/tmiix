import { useMemo } from 'react'
import { useValue } from '@legendapp/state/react'
import { getKnownServers, servers$ } from '../../state/servers'
import { addServerFromCommand, revealServer } from '../../state/sidebar'
import { closeRemotePalette, ui$ } from '../../state/ui'
import { RemoteServerPalette } from '../palette/RemoteServerPalette'
import { SidebarLocalHeader, SidebarLocalSessions } from './SidebarLocalSection'
import { SidebarServerSection } from './SidebarServerSection'

export function Sidebar() {
  const collapsed = useValue(ui$.sidebarCollapsed)
  const servers = useValue(servers$.items)
  const configHosts = useValue(servers$.configHosts)
  const remotePaletteOpen = useValue(ui$.remotePalette.open)
  const remotePaletteConnectMode = useValue(ui$.remotePalette.connectMode)

  const knownServers = useMemo(() => getKnownServers(), [configHosts, servers])

  return (
    <>
      <aside
        className={`flex flex-col bg-surface border-r border-border min-w-0 overflow-hidden transition-[opacity,border-color] duration-[120ms] ease-in-out ${
          collapsed ? 'opacity-0 pointer-events-none border-r-transparent w-0' : 'w-[260px]'
        }`}
      >
        <SidebarLocalHeader />

        <div className="flex-1 overflow-auto">
          <SidebarLocalSessions />

          <div data-section="servers">
            {servers.map((srv) => (
              <SidebarServerSection key={srv.name} server={srv} />
            ))}
          </div>
        </div>
      </aside>

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
