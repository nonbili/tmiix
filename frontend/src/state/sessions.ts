import { observable } from '@legendapp/state'
import { ListRemoteSessions, ListSessions } from '../../wailsjs/go/main/App'
import { sessionMatchesQuery } from '../lib/search'
import { readStoredRecentSessions, updateRecentSessions } from '../lib/storage'
import { servers$ } from './servers'
import { ui$ } from './ui'

export const sessions$ = observable({
  items: [] as string[],
  remote: {} as Record<string, string[]>,
  recent: readStoredRecentSessions(),
})

export async function refreshSessions() {
  try {
    sessions$.items.set(await ListSessions())
  } catch {
    /* ignore */
  }
}

export async function refreshRemoteSessions(serverName: string) {
  const list = await ListRemoteSessions(serverName)
  sessions$.remote.set((current) => ({ ...current, [serverName]: list }))
  return list
}

export function clearRemoteSessions(serverName: string) {
  sessions$.remote.set((current) => {
    if (!(serverName in current)) return current
    const { [serverName]: _removed, ...rest } = current
    return rest
  })
}

export function markRecentSession(sessionName: string) {
  sessions$.recent.set((recent) => updateRecentSessions(recent, sessionName))
}

export type PaletteItem =
  | { kind: 'local'; name: string }
  | {
      kind: 'remote'
      serverName: string
      name: string
      color: string | null
    }
  | { kind: 'shell-local' }
  | { kind: 'shell-remote'; serverName: string; color: string | null }
  | { kind: 'connect-server'; serverName: string; color: string | null }

export function paletteItemKey(item: PaletteItem) {
  switch (item.kind) {
    case 'local':
      return `local:${item.name}`
    case 'remote':
      return `remote:${item.serverName}:${item.name}`
    case 'shell-local':
      return 'shell-local'
    case 'shell-remote':
      return `shell-remote:${item.serverName}`
    case 'connect-server':
      return `connect-server:${item.serverName}`
  }
}

export function getPaletteItems(): PaletteItem[] {
  const query = ui$.palette.query.peek()
  const mode = ui$.palette.mode.peek()
  const recent = sessions$.recent.peek()

  const local = sessions$.items
    .peek()
    .filter((name) => sessionMatchesQuery(name, query))
    .sort((left, right) => {
      const leftRecent = recent.indexOf(left)
      const rightRecent = recent.indexOf(right)
      if (leftRecent !== -1 || rightRecent !== -1) {
        if (leftRecent === -1) return 1
        if (rightRecent === -1) return -1
        return leftRecent - rightRecent
      }
      return left.localeCompare(right)
    })
    .map<PaletteItem>((name) => ({ kind: 'local', name }))

  const remoteMap = sessions$.remote.peek()
  const servers = servers$.items.peek()
  const remote: PaletteItem[] = []
  for (const server of servers) {
    const list = remoteMap[server.name] ?? []
    for (const name of list) {
      if (sessionMatchesQuery(name, query) || sessionMatchesQuery(`${server.name}:${name}`, query)) {
        remote.push({
          kind: 'remote',
          serverName: server.name,
          name,
          color: server.color || null,
        })
      }
    }
  }
  remote.sort((left, right) => {
    if (left.kind !== 'remote' || right.kind !== 'remote') return 0
    const byServer = left.serverName.localeCompare(right.serverName)
    return byServer !== 0 ? byServer : left.name.localeCompare(right.name)
  })

  const connect: PaletteItem[] = []
  for (const server of servers) {
    if (server.name in remoteMap) continue
    if (sessionMatchesQuery(server.name, query) || sessionMatchesQuery(`connect to ${server.name}`, query)) {
      connect.push({
        kind: 'connect-server',
        serverName: server.name,
        color: server.color || null,
      })
    }
  }
  connect.sort((left, right) => {
    if (left.kind !== 'connect-server' || right.kind !== 'connect-server') return 0
    return left.serverName.localeCompare(right.serverName)
  })

  if (mode !== 'new') return [...local, ...remote, ...connect]

  const shell: PaletteItem[] = []
  if (sessionMatchesQuery('open local shell', query)) {
    shell.push({ kind: 'shell-local' })
  }
  for (const server of servers) {
    if (sessionMatchesQuery(`open shell on ${server.name}`, query)) {
      shell.push({
        kind: 'shell-remote',
        serverName: server.name,
        color: server.color || null,
      })
    }
  }

  return [...local, ...remote, ...connect, ...shell]
}
