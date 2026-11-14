import { observable } from '@legendapp/state'
import { ListRemoteSessions, ListRemoteSessionsQuiet, ListSessions } from '../../bindings/tmiix/app'
import { sessionMatchesQuery, sessionMatchRank } from '../lib/search'
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

export async function refreshRemoteSessions(serverName: string, options: { prompt?: boolean } = {}) {
  const list =
    options.prompt === false ? await ListRemoteSessionsQuiet(serverName) : await ListRemoteSessions(serverName)
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

export function paletteItemLabel(item: PaletteItem): string {
  switch (item.kind) {
    case 'local':
      return item.name
    case 'remote':
      return item.name
    case 'shell-local':
      return 'Open local shell'
    case 'shell-remote':
      return `Open remote shell on ${item.serverName}`
    case 'connect-server':
      return `Connect to ${item.serverName}`
  }
}

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

function paletteItemSortLabel(item: PaletteItem): string {
  switch (item.kind) {
    case 'local':
      return item.name
    case 'remote':
      return `${item.serverName}:${item.name}`
    case 'shell-local':
      return paletteItemLabel(item)
    case 'shell-remote':
      return paletteItemLabel(item)
    case 'connect-server':
      return paletteItemLabel(item)
  }
}

function sessionItemRank(item: Extract<PaletteItem, { kind: 'local' | 'remote' }>, query: string): number {
  if (item.kind === 'local') return sessionMatchRank(item.name, query) ?? Number.MAX_SAFE_INTEGER
  return Math.min(
    sessionMatchRank(item.name, query) ?? Number.MAX_SAFE_INTEGER,
    sessionMatchRank(`${item.serverName}:${item.name}`, query) ?? Number.MAX_SAFE_INTEGER,
  )
}

function sessionKindPriority(item: Extract<PaletteItem, { kind: 'local' | 'remote' }>): number {
  return item.kind === 'local' ? 0 : 1
}

export function getPaletteItems(): PaletteItem[] {
  const query = ui$.palette.query.peek()
  const mode = ui$.palette.mode.peek()
  const recent = sessions$.recent.peek()

  const sessionItems: Extract<PaletteItem, { kind: 'local' | 'remote' }>[] = sessions$.items
    .peek()
    .filter((name) => sessionMatchesQuery(name, query))
    .map((name) => ({ kind: 'local', name }))

  const remoteMap = sessions$.remote.peek()
  const servers = servers$.items.peek()
  for (const server of servers) {
    const list = remoteMap[server.name] ?? []
    for (const name of list) {
      if (sessionMatchesQuery(name, query) || sessionMatchesQuery(`${server.name}:${name}`, query)) {
        sessionItems.push({
          kind: 'remote',
          serverName: server.name,
          name,
          color: server.color || null,
        })
      }
    }
  }

  sessionItems.sort((left, right) => {
    const byRank = sessionItemRank(left, query) - sessionItemRank(right, query)
    if (byRank !== 0) return byRank

    const leftRecent = left.kind === 'local' ? recent.indexOf(left.name) : -1
    const rightRecent = right.kind === 'local' ? recent.indexOf(right.name) : -1
    if (leftRecent !== -1 || rightRecent !== -1) {
      if (leftRecent === -1) return 1
      if (rightRecent === -1) return -1
      return leftRecent - rightRecent
    }

    const byKind = sessionKindPriority(left) - sessionKindPriority(right)
    if (byKind !== 0) return byKind

    return paletteItemSortLabel(left).localeCompare(paletteItemSortLabel(right))
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

  if (mode !== 'new') return [...sessionItems, ...connect]

  const shell: PaletteItem[] = []
  const localShell: PaletteItem = { kind: 'shell-local' }
  if (sessionMatchesQuery(paletteItemLabel(localShell), query)) {
    shell.push(localShell)
  }
  for (const server of servers) {
    const item: PaletteItem = {
      kind: 'shell-remote',
      serverName: server.name,
      color: server.color || null,
    }
    if (sessionMatchesQuery(paletteItemLabel(item), query)) {
      shell.push(item)
    }
  }

  return [...sessionItems, ...connect, ...shell]
}
