import { useValue } from '@legendapp/state/react'
import { RefreshCw } from 'lucide-react'
import { main } from '../../../wailsjs/go/models'
import { remoteKey } from '../../lib/session'
import { useContextMenu } from '../../lib/useContextMenu'
import { sessions$ } from '../../state/sessions'
import {
  disconnectServer,
  loadServerSessions,
  removeServer,
  sidebar$,
  toggleServer,
  updateServerColor,
} from '../../state/sidebar'
import {
  attachRemote,
  getActiveRemote,
  getRemoteAttached,
  openRemoteShell,
  tabs$,
} from '../../state/tabs'
import { IconButton } from '../button/IconButton'
import { SidebarSectionHeader } from './SidebarSectionHeader'
import { SidebarSectionMenu, type SectionMenuItem } from './SidebarSectionMenu'
import { SidebarSessionRow } from './SidebarSessionRow'

interface SidebarServerSectionProps {
  server: main.SSHServer
}

export function SidebarServerSection({ server }: SidebarServerSectionProps) {
  const state = useValue(sidebar$.servers[server.name])
  const remoteSessions = useValue(sessions$.remote)
  useValue(tabs$.items)
  const menu = useContextMenu()

  const expanded = state?.expanded ?? false
  const srvSessions = remoteSessions[server.name] ?? []
  const count = srvSessions.length
  const connected = state?.state === 'loaded'
  const remoteAttached = getRemoteAttached()
  const activeRemote = getActiveRemote()

  const status = connected
    ? 'connected'
    : state?.state === 'error'
      ? 'error'
      : state?.state === 'loading'
        ? 'loading'
        : 'idle'

  const items: SectionMenuItem[] = [
    {
      kind: 'button',
      label: 'Open Shell',
      onClick: () => {
        void openRemoteShell(server.name)
        if (!connected) void loadServerSessions(server.name)
      },
    },
    ...(status !== 'connected' && status !== 'loading'
      ? [{ kind: 'button' as const, label: 'Connect', onClick: () => void loadServerSessions(server.name) }]
      : []),
    ...(status === 'connected' || status === 'error'
      ? [{ kind: 'button' as const, label: 'Disconnect', onClick: () => disconnectServer(server.name) }]
      : []),
    {
      kind: 'colors',
      value: server.color || undefined,
      onChange: (color) => void updateServerColor(server, color),
    },
    ...(status === 'idle' || status === 'error'
      ? [{ kind: 'button' as const, label: 'Remove', onClick: () => void removeServer(server.name), danger: true }]
      : []),
  ]

  return (
    <div>
      <SidebarSectionHeader
        title={server.name}
        expanded={expanded}
        count={connected ? count : undefined}
        color={server.color || undefined}
        status={status}
        titleTooltip={
          state?.state === 'error'
            ? `${serverTooltip(server)} — ${state.error ?? 'connection failed'}`
            : connected
              ? `${serverTooltip(server)} — connected`
              : serverTooltip(server)
        }
        borderedTop
        onToggle={() => toggleServer(server.name)}
        onContextMenu={menu.onContextMenu}
        onRefresh={
          state?.state === undefined || state?.state === 'idle'
            ? () => void loadServerSessions(server.name)
            : undefined
        }
        onDisconnect={
          connected || state?.state === 'error' ? () => disconnectServer(server.name) : undefined
        }
        rightSlot={
          connected ? (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-[120ms]">
              <IconButton
                icon={<RefreshCw size={14} strokeWidth={1.7} />}
                title="Refresh"
                size={16}
                className="text-foreground-subtle hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  void loadServerSessions(server.name)
                }}
              />
            </div>
          ) : undefined
        }
      />

      {menu.open ? (
        <SidebarSectionMenu items={items} position={menu.position} innerRef={menu.ref} onClose={menu.close} />
      ) : null}

      {expanded ? (
        <div className="py-1">
          {state?.state === 'error' ? (
            <div className="px-5 pb-2 text-term-red text-[11px] leading-[1.5] break-words">
              {state.error ?? 'connection failed'}
            </div>
          ) : state?.state === 'loaded' && srvSessions.length === 0 ? (
            <div className="px-5 py-1 text-foreground-subtle text-[11px]">No sessions.</div>
          ) : (
            srvSessions.map((name) => {
              const key = remoteKey(server.name, name)
              const attached = remoteAttached.has(key)
              const active = activeRemote === key
              return (
                <SidebarSessionRow
                  key={name}
                  name={name}
                  active={active}
                  attached={attached}
                  color={server.color}
                  onClick={() => void attachRemote(server.name, name)}
                />
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

function serverTooltip(s: main.SSHServer) {
  const target = s.user ? `${s.user}@${s.host}` : s.host
  const port = s.port ? `:${s.port}` : ''
  return `${target}${port}`
}
