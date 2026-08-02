import { observable } from '@legendapp/state'
import {
  AttachRemoteSession,
  AttachSession,
  CloseTab,
  DetectTabSession,
  KillRemoteSession,
  KillSession,
  OpenRemoteShell,
  OpenShell,
  WriteTab,
} from '../../wailsjs/go/main/App'
import type { Tab, TabStatus } from '../types'
import type { StoredTab } from '../lib/storage'
import { findServer } from './servers'
import { markRecentSession, refreshRemoteSessions, refreshSessions } from './sessions'
import { remoteKey } from '../lib/session'
import { ui$ } from './ui'

const OPEN_TMUX_HERE_COMMAND =
  'name=$(basename "$PWD"); name=${name:-tmux}; name=$(printf \'%s\' "$name" | tr \':.\' \'__\'); printf \'\\033]0;%s\\007\' "$name"; TMUX= tmux new-session -A -s "$name"\r'

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

export function canOpenTmuxHere(tab: Tab | null | undefined): tab is Tab {
  return tab?.kind === 'shell' && !tab.tmuxStarted
}

export async function openTmuxHere(tabId?: string) {
  const tab = tabId ? getTabs().find((item) => item.id === tabId) : getActiveTab()
  if (!canOpenTmuxHere(tab)) return
  tabs$.items.set((current) => current.map((item) => (item.id === tab.id ? { ...item, tmuxStarted: true } : item)))
  await WriteTab(tab.id, OPEN_TMUX_HERE_COMMAND)
  window.setTimeout(() => {
    void refreshSessions()
    void promoteShellTabIfSessionDetected(tab.id)
  }, 500)
}

// A shell tab has no known tmux session by default. But the user (or an
// external script, e.g. one on $PATH) may run `tmux new-session`/`attach`
// directly inside that shell rather than through tmiix's own attach flow —
// tmiix's own "Open tmux session here" above does exactly this. In both
// cases the tab's internal state never learns a session is now live there,
// so actions like "Kill session" silently no-op. We reconcile by asking the
// backend whether a tmux client is attached on this tab's pty (matched via
// tty, see DetectTabSession) and, if so, promoting the tab to a proper
// session tab — the same state an explicit "Switch session" attach produces.
const detectingTabs = new Set<string>()

async function detectTabSessionWithRetry(tabId: string): Promise<string | null> {
  // The signals we detect on (a title change, or the switch to the alternate
  // screen) can fire slightly before the tmux client has registered itself —
  // by a second or more when the client is on the far side of an ssh
  // connection — so retry a couple of times before giving up.
  for (const delay of [0, 600, 1500]) {
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay))
    try {
      const sessionName = await DetectTabSession(tabId)
      if (sessionName) return sessionName
    } catch {
      return null
    }
  }
  return null
}

// Exported for the terminal view: switching to the alternate screen buffer is
// the moment a full-screen program (a tmux client among them) takes over the
// tab, and unlike a title change it fires *after* the session is up. Title
// events are emitted by the shell prompt, i.e. before the command runs, so on
// their own they miss a session started by that very command.
export function checkTabForSession(tabId: string) {
  void promoteShellTabIfSessionDetected(tabId)
}

async function promoteShellTabIfSessionDetected(tabId: string) {
  if (detectingTabs.has(tabId)) return
  const tab = getTabs().find((item) => item.id === tabId)
  if (!tab || tab.kind !== 'shell' || tab.sessionName) return
  const serverName = tab.serverName

  detectingTabs.add(tabId)
  try {
    const sessionName = await detectTabSessionWithRetry(tabId)
    if (!sessionName) return

    const current = getTabs().find((item) => item.id === tabId)
    if (!current || current.kind !== 'shell' || current.sessionName) return

    const kind = serverName ? 'remote' : 'session'
    tabs$.items.set((list) =>
      list.map((item) => (item.id === tabId ? { ...item, kind, sessionName, tmuxStarted: true } : item)),
    )
    if (serverName) {
      void refreshRemoteSessions(serverName, { prompt: false }).catch(() => {})
    } else {
      markRecentSession(sessionName)
      void refreshSessions()
    }
  } finally {
    detectingTabs.delete(tabId)
  }
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
  cancelReconnect(id)
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

function closeTabsWhere(predicate: (tab: Tab) => boolean) {
  const activeTabId = tabs$.activeTabId.peek()
  const currentTabs = tabs$.items.peek()
  const idsToClose = currentTabs.filter(predicate).map((tab) => tab.id)
  if (idsToClose.length === 0) return

  const closeSet = new Set(idsToClose)
  for (const id of idsToClose) cancelReconnect(id)
  tabs$.items.set((current) => {
    const activeIndex = current.findIndex((tab) => tab.id === activeTabId)
    const nextTabs = current.filter((tab) => !closeSet.has(tab.id))
    if (activeTabId && closeSet.has(activeTabId)) {
      const fallback = nextTabs[activeIndex] ?? nextTabs[activeIndex - 1] ?? nextTabs[0]
      tabs$.activeTabId.set(fallback ? fallback.id : null)
    }
    return nextTabs
  })

  for (const id of idsToClose) {
    void CloseTab(id).catch(() => {})
  }
}

export function closeOtherTabs(id: string) {
  closeTabsWhere((tab) => tab.id !== id)
}

export function closeTabsToRight(id: string) {
  const index = getTabs().findIndex((tab) => tab.id === id)
  if (index === -1) return
  const rightIds = new Set(getTabs().slice(index + 1).map((tab) => tab.id))
  closeTabsWhere((tab) => rightIds.has(tab.id))
}

export async function killSession(sessionName: string) {
  try {
    await KillSession(sessionName)
    closeTabsWhere((tab) => tab.kind === 'session' && tab.sessionName === sessionName)
  } catch (error) {
    console.error('kill session failed', error)
    throw error
  } finally {
    await refreshSessions()
  }
}

export async function killRemoteSession(serverName: string, sessionName: string) {
  try {
    await KillRemoteSession(serverName, sessionName)
    closeTabsWhere(
      (tab) => tab.kind === 'remote' && tab.serverName === serverName && tab.sessionName === sessionName,
    )
  } catch (error) {
    console.error('kill remote session failed', error)
    throw error
  } finally {
    await refreshRemoteSessions(serverName).catch(() => {})
  }
}

// --- Remote tab auto-reconnect ----------------------------------------------
//
// When an ssh-backed tab's process exits unexpectedly (the connection dropped,
// e.g. after the machine suspends/resumes) we transparently re-attach instead
// of removing the tab. Attaching to a remote tmux session resumes the live
// session with no work lost. After a bounded number of rapid failures we give
// up and mark the tab disconnected so the user can retry manually.

const MAX_RECONNECT_ATTEMPTS = 5
// A connection that stayed up at least this long before dropping earns a fresh
// retry budget — distinguishing a one-off blip from a server that's truly gone.
const STABLE_CONNECTION_MS = 20_000

type ReconnectInfo = { attempts: number; timer?: number; connectedAt?: number }
const reconnects = new Map<string, ReconnectInfo>()

function reconnectBackoffMs(attempt: number) {
  return Math.min(1000 * 2 ** (attempt - 1), 10_000)
}

function isReconnectable(tab: Tab): boolean {
  return Boolean(tab.serverName) && (tab.kind === 'remote' || tab.kind === 'shell')
}

function setTabStatus(id: string, status: TabStatus | undefined, attempt?: number) {
  tabs$.items.set((current) =>
    current.map((tab) => (tab.id === id ? { ...tab, status, reconnectAttempt: attempt } : tab)),
  )
}

function cancelReconnect(id: string) {
  const info = reconnects.get(id)
  if (info?.timer) window.clearTimeout(info.timer)
  reconnects.delete(id)
}

async function reattachTab(tab: Tab) {
  if (tab.kind === 'remote' && tab.serverName && tab.sessionName) {
    await AttachRemoteSession(tab.id, tab.serverName, tab.sessionName)
  } else if (tab.kind === 'shell' && tab.serverName) {
    await OpenRemoteShell(tab.id, tab.serverName)
  } else {
    throw new Error('tab is not reconnectable')
  }
}

function attemptReconnect(tab: Tab) {
  if (!getTabs().some((item) => item.id === tab.id)) {
    reconnects.delete(tab.id)
    return
  }
  reattachTab(tab)
    .then(() => {
      if (!getTabs().some((item) => item.id === tab.id)) {
        // Tab was closed mid-reconnect — tear down the session we just opened.
        void CloseTab(tab.id).catch(() => {})
        reconnects.delete(tab.id)
        return
      }
      const info = reconnects.get(tab.id)
      if (info) info.connectedAt = Date.now()
      setTabStatus(tab.id, 'connected')
    })
    .catch(() => scheduleReconnect(tab))
}

function scheduleReconnect(tab: Tab) {
  const info = reconnects.get(tab.id) ?? { attempts: 0 }
  if (info.attempts >= MAX_RECONNECT_ATTEMPTS) {
    reconnects.set(tab.id, info)
    setTabStatus(tab.id, 'disconnected')
    return
  }
  info.attempts += 1
  reconnects.set(tab.id, info)
  setTabStatus(tab.id, 'reconnecting', info.attempts)
  info.timer = window.setTimeout(() => attemptReconnect(tab), reconnectBackoffMs(info.attempts))
}

// reconnectTab is the manual retry entry point (from the disconnected overlay).
// It resets the retry budget and attempts immediately.
export function reconnectTab(id: string) {
  const tab = getTabs().find((item) => item.id === id)
  if (!tab || !isReconnectable(tab)) return
  cancelReconnect(id)
  reconnects.set(id, { attempts: 0 })
  setTabStatus(id, 'reconnecting', 1)
  attemptReconnect(tab)
}

function removeTabFromList(id: string) {
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

export function handleTabClosedFromBackend(id: string, clean = true) {
  const tab = getTabs().find((item) => item.id === id)
  if (!tab) {
    cancelReconnect(id)
    return
  }

  // An unexpected drop on a remote tab → try to bring it back.
  if (!clean && isReconnectable(tab)) {
    const info = reconnects.get(id)
    if (info?.connectedAt && Date.now() - info.connectedAt > STABLE_CONNECTION_MS) {
      // Was stable for a while; start a fresh retry budget.
      cancelReconnect(id)
    }
    scheduleReconnect(tab)
    return
  }

  // Clean exit, or a non-reconnectable (local) tab → remove it.
  cancelReconnect(id)
  removeTabFromList(id)
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
  let isShell = false
  tabs$.items.set((current) =>
    current.map((tab) => {
      if (tab.id !== id) return tab

      let nextLabel = label
      const isLocal = (tab.kind === 'shell' && !tab.serverName) || tab.kind === 'session'
      isShell = tab.kind === 'shell'

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

  // A shell tab's title just changed — it may have just started a tmux
  // session (e.g. an external ~/bin script), locally or on the far side of an
  // ssh tab. Check in the background.
  if (isShell) void promoteShellTabIfSessionDetected(id)
}
