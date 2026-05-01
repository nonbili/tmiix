import { observable } from '@legendapp/state'
import { AddSSHServer, RemoveSSHServer } from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'
import { parseSSHCommand } from '../lib/ssh'
import { TAB_COLORS } from '../lib/session'
import { refreshServers, servers$ } from './servers'
import { clearRemoteSessions, refreshRemoteSessions } from './sessions'
import { showToast } from './toasts'

export type LoadState = 'idle' | 'loading' | 'loaded' | 'error'

export interface ServerSidebarState {
  state: LoadState
  error?: string
  expanded: boolean
}

export const sidebar$ = observable({
  localExpanded: true,
  servers: {} as Record<string, ServerSidebarState>,
  rememberedColors: {} as Record<string, string>,
})

export function toggleLocalExpanded() {
  sidebar$.localExpanded.set((v) => !v)
}

function patchServer(name: string, patch: Partial<ServerSidebarState>) {
  const current = sidebar$.servers[name].get() ?? { state: 'idle' as LoadState, expanded: false }
  sidebar$.servers[name].set({ ...current, ...patch })
}

function deleteServer(name: string) {
  const next = { ...sidebar$.servers.get() }
  delete next[name]
  sidebar$.servers.set(next)
}

export async function loadServerSessions(name: string) {
  const previousState = sidebar$.servers[name].get()?.state
  patchServer(name, { state: 'loading', expanded: true })
  try {
    await refreshRemoteSessions(name)
    sidebar$.servers[name].set({ state: 'loaded', expanded: true })
    if (previousState !== 'loaded') {
      showToast('success', `Connected to ${name}`)
    }
  } catch (e) {
    const message = (e as Error)?.message ?? String(e)
    sidebar$.servers[name].set({ state: 'error', error: message, expanded: true })
    showToast('error', `Failed to connect to ${name}: ${message}`)
  }
}

export function toggleServer(name: string) {
  const current = sidebar$.servers[name].get()
  if (current?.expanded) {
    patchServer(name, { expanded: false })
    return
  }
  if (!current || current.state === 'idle') {
    void loadServerSessions(name)
    return
  }
  patchServer(name, { expanded: true })
}

export function disconnectServer(name: string) {
  clearRemoteSessions(name)
  deleteServer(name)
}

export async function removeServer(name: string) {
  if (!window.confirm(`Remove server "${name}"?`)) return
  try {
    const server = servers$.items.get().find((candidate) => candidate.name === name)
    if (server?.color) {
      sidebar$.rememberedColors[name].set(server.color)
    }
    await RemoveSSHServer(name)
    deleteServer(name)
    await refreshServers()
  } catch {
    /* ignore */
  }
}

export async function updateServerColor(server: main.SSHServer, color: string) {
  try {
    await AddSSHServer(main.SSHServer.createFrom({ ...server, color }))
    await refreshServers()
  } catch {
    /* ignore */
  }
}

export async function revealServer(server: main.SSHServer) {
  const remembered = sidebar$.rememberedColors[server.name].get()
  const color = server.color || remembered || TAB_COLORS[Math.floor(Math.random() * TAB_COLORS.length)]
  await AddSSHServer(main.SSHServer.createFrom({ ...server, color }))
  await refreshServers()
  await loadServerSessions(server.name)
}

export async function addServerFromCommand(command: string) {
  const parsed = parseSSHCommand(command)
  const configMatch = servers$.configHosts.get().find((server) => server.name === parsed.name)
  await revealServer(configMatch ?? parsed)
}
