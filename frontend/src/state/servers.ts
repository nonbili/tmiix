import { observable } from '@legendapp/state'
import { ListSSHConfigHosts, ListSSHServers } from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'

export const servers$ = observable({
  items: [] as main.SSHServer[],
  configHosts: [] as main.SSHServer[],
})

export async function refreshServers() {
  try {
    const [items, configHosts] = await Promise.all([ListSSHServers(), ListSSHConfigHosts()])
    servers$.items.set(items)
    servers$.configHosts.set(configHosts)
  } catch {
    /* ignore */
  }
}

export function findServer(serverName: string) {
  return (
    servers$.items.peek().find((server) => server.name === serverName) ||
    servers$.configHosts.peek().find((server) => server.name === serverName) ||
    null
  )
}

export function getKnownServers() {
  const merged = new Map<string, main.SSHServer>()
  for (const server of servers$.items.peek()) merged.set(server.name, server)
  for (const server of servers$.configHosts.peek()) {
    if (!merged.has(server.name)) merged.set(server.name, server)
  }
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name))
}
