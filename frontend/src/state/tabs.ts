import { observable } from '@legendapp/state'
import { AttachRemoteSession, AttachSession, CloseTab, OpenRemoteShell, OpenShell } from '../../wailsjs/go/main/App'
import type { Tab } from '../types'
import type { StoredTab } from '../lib/storage'
import { findServer } from './servers'
import { markRecentSession } from './sessions'
import { remoteKey } from '../lib/session'
import { ui$ } from './ui'

export const tabs$ = observable({
  items: [] as Tab[],
  activeTabId: null as string | null,
})

let sessionCounter = 0

function nextSessionTabId(prefix: 'session' | 'remote' | 'shell', ...parts: string[]) {
  sessionCounter += 1
  return `${prefix}-${sessionCounter}-${parts.join('-')}`
}

export function getTabs() {
  return tabs$.items.peek()
}

export function getActiveTab() {
  const tabs = getTabs()
  const activeTabId = tabs$.activeTabId.peek()
  return tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null
}

export function getActiveSession() {
  const activeTab = getActiveTab()
  return activeTab?.kind === 'session' ? activeTab.sessionName : null
}

export function getActiveRemote() {
  const activeTab = getActiveTab()
  if (activeTab?.kind === 'remote' && activeTab.serverName && activeTab.sessionName) {
    return remoteKey(activeTab.serverName, activeTab.sessionName)
  }
  return null
}

export function getAttachedSessions() {
  return new Set(
    getTabs()
      .filter((tab) => tab.kind === 'session' && tab.sessionName)
      .map((tab) => tab.sessionName as string),
  )
}

export function getRemoteAttached() {
  return new Set(
    getTabs()
      .filter((tab) => tab.kind === 'remote' && tab.serverName && tab.sessionName)
      .map((tab) => remoteKey(tab.serverName as string, tab.sessionName as string)),
  )
}

export function toStoredTab(tab: Tab): StoredTab | null {
  if (tab.kind === 'session' && tab.sessionName) {
    return { kind: 'session', sessionName: tab.sessionName }
  }
  if (tab.kind === 'remote' && tab.serverName && tab.sessionName) {
    return {
      kind: 'remote',
      serverName: tab.serverName,
      sessionName: tab.sessionName,
    }
  }
  return null
}

export function tabStorageKey(tab: Tab): string | null {
  const stored = toStoredTab(tab)
  if (!stored) return null
  return stored.kind === 'session'
    ? `session:${stored.sessionName}`
    : `remote:${remoteKey(stored.serverName, stored.sessionName)}`
}

export function setActiveTabId(id: string) {
  tabs$.activeTabId.set(id)
}

export function cycleActiveTab(offset: number) {
  const tabs = tabs$.items.peek()
  if (tabs.length === 0) return

  const activeTabId = tabs$.activeTabId.peek()
  const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
  const baseIndex = currentIndex >= 0 ? currentIndex : 0
  const nextIndex = (baseIndex + offset + tabs.length) % tabs.length
  tabs$.activeTabId.set(tabs[nextIndex].id)
}

export function reorderTabs(fromIndex: number, toIndex: number) {
  tabs$.items.set((current) => {
    const next = [...current]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    return next
  })
}

export async function openLocalShell() {
  const id = nextSessionTabId('shell', 'local')
  const newTab: Tab = {
    id,
    kind: 'shell',
    label: 'local:shell',
    sessionName: null,
    color: ui$.localColor.peek() ?? null,
  }
  tabs$.items.set((current) => [...current, newTab])
  tabs$.activeTabId.set(id)

  try {
    await OpenShell(id)
  } catch (error) {
    tabs$.items.set((current) => current.filter((tab) => tab.id !== id))
    console.error('open shell failed', error)
  }
}

export async function openRemoteShell(serverName: string) {
  const server = findServer(serverName)
  const id = nextSessionTabId('shell', 'remote', serverName)
  const newTab: Tab = {
    id,
    kind: 'shell',
    label: `${serverName}:shell`,
    serverName,
    sessionName: null,
    color: server?.color || null,
  }
  tabs$.items.set((current) => [...current, newTab])
  tabs$.activeTabId.set(id)

  try {
    await OpenRemoteShell(id, serverName)
  } catch (error) {
    tabs$.items.set((current) => current.filter((tab) => tab.id !== id))
    console.error('open remote shell failed', error)
  }
}

export async function attachSession(sessionName: string) {
  const existing = getTabs().find((tab) => tab.kind === 'session' && tab.sessionName === sessionName)
  if (existing) {
    tabs$.activeTabId.set(existing.id)
    markRecentSession(sessionName)
    return
  }

  const id = nextSessionTabId('session', sessionName)
  const newTab: Tab = {
    id,
    kind: 'session',
    label: sessionName,
    sessionName,
    color: ui$.localColor.peek() ?? null,
  }
  tabs$.items.set((current) => [...current, newTab])
  tabs$.activeTabId.set(id)
  markRecentSession(sessionName)

  try {
    await AttachSession(id, sessionName)
  } catch (error) {
    tabs$.items.set((current) => current.filter((tab) => tab.id !== id))
    console.error('attach failed', error)
  }
}

export async function switchActiveTabSession(sessionName: string) {
  const activeTab = getActiveTab()
  if (!activeTab || activeTab.kind !== 'session') {
    await attachSession(sessionName)
    return
  }
  if (activeTab.sessionName === sessionName) return

  const oldId = activeTab.id
  const newId = nextSessionTabId('session', sessionName)
  tabs$.items.set((current) =>
    current.map((tab) =>
      tab.id === oldId
        ? { id: newId, kind: 'session', label: sessionName, sessionName, color: ui$.localColor.peek() ?? null }
        : tab,
    ),
  )
  tabs$.activeTabId.set(newId)
  markRecentSession(sessionName)

  try {
    await CloseTab(oldId)
    await AttachSession(newId, sessionName)
  } catch (error) {
    console.error('switch failed', error)
  }
}

export async function switchActiveTabRemote(serverName: string, sessionName: string) {
  const activeTab = getActiveTab()
  if (!activeTab) {
    await attachRemote(serverName, sessionName)
    return
  }
  if (activeTab.kind === 'remote' && activeTab.serverName === serverName && activeTab.sessionName === sessionName) {
    return
  }

  const server = findServer(serverName)
  const oldId = activeTab.id
  const newId = nextSessionTabId('remote', serverName, sessionName)
  tabs$.items.set((current) =>
    current.map((tab) =>
      tab.id === oldId
        ? {
            id: newId,
            kind: 'remote',
            label: `${serverName}:${sessionName}`,
            sessionName,
            serverName,
            color: server?.color || null,
          }
        : tab,
    ),
  )
  tabs$.activeTabId.set(newId)

  try {
    await CloseTab(oldId)
    await AttachRemoteSession(newId, serverName, sessionName)
  } catch (error) {
    console.error('remote switch failed', error)
  }
}

export async function attachRemote(serverName: string, sessionName: string) {
  const key = remoteKey(serverName, sessionName)
  const existing = getTabs().find(
    (tab) =>
      tab.kind === 'remote' && tab.serverName && tab.sessionName && remoteKey(tab.serverName, tab.sessionName) === key,
  )
  if (existing) {
    tabs$.activeTabId.set(existing.id)
    return
  }

  const server = findServer(serverName)
  const id = nextSessionTabId('remote', serverName, sessionName)
  const newTab: Tab = {
    id,
    kind: 'remote',
    label: `${serverName}:${sessionName}`,
    sessionName,
    serverName,
    color: server?.color || null,
  }
  tabs$.items.set((current) => [...current, newTab])
  tabs$.activeTabId.set(id)

  try {
    await AttachRemoteSession(id, serverName, sessionName)
  } catch (error) {
    tabs$.items.set((current) => current.filter((tab) => tab.id !== id))
    console.error('remote attach failed', error)
  }
}

export function closeTab(id: string) {
  const activeTabId = tabs$.activeTabId.peek()
  tabs$.items.set((current) => {
    const index = current.findIndex((tab) => tab.id === id)
    if (index === -1) return current

    const nextTabs = current.filter((tab) => tab.id !== id)
    if (activeTabId === id) {
      const fallback = nextTabs[index] ?? nextTabs[index - 1] ?? nextTabs[0]
      if (fallback) tabs$.activeTabId.set(fallback.id)
      else tabs$.activeTabId.set(null)
    }
    return nextTabs
  })

  void CloseTab(id).catch(() => {})
}

export function handleTabClosedFromBackend(id: string) {
  tabs$.items.set((current) => {
    const index = current.findIndex((tab) => tab.id === id)
    if (index === -1) return current

    const nextTabs = current.filter((tab) => tab.id !== id)
    if (tabs$.activeTabId.peek() === id) {
      const fallback = nextTabs[index] ?? nextTabs[index - 1] ?? nextTabs[0]
      tabs$.activeTabId.set(fallback ? fallback.id : null)
    }
    return nextTabs
  })
}

export function syncLocalTabColors() {
  const color = ui$.localColor.peek() ?? null
  tabs$.items.set((current) =>
    current.map((tab) => {
      const isLocal = tab.kind === 'session' || (tab.kind === 'shell' && !tab.serverName)
      if (!isLocal) return tab
      if (tab.color === color) return tab
      return { ...tab, color }
    }),
  )
}

export function syncRemoteTabColors() {
  tabs$.items.set((current) =>
    current.map((tab) => {
      if (tab.kind !== 'remote' || !tab.serverName) return tab
      const server = findServer(tab.serverName)
      if (server?.color && server.color !== tab.color) {
        return { ...tab, color: server.color }
      }
      return tab
    }),
  )
}

export function updateTabLabel(id: string, label: string) {
  tabs$.items.set((current) =>
    current.map((tab) => {
      if (tab.id !== id) return tab

      let nextLabel = label
      const isLocal = (tab.kind === 'shell' && !tab.serverName) || tab.kind === 'session'

      if (isLocal) {
        // Strip user@host: prefix if present (common in default shell prompts)
        const colonIndex = nextLabel.indexOf(':')
        if (colonIndex > 0 && nextLabel.slice(0, colonIndex).includes('@')) {
          const stripped = nextLabel.slice(colonIndex + 1).trim()
          if (stripped) {
            nextLabel = stripped
          }
        }
      }

      return { ...tab, label: nextLabel }
    }),
  )
}
