import { useValue } from '@legendapp/state/react'
import { useEffect } from 'react'
import { GetSettings, IsTmuxAvailable } from '../../../wailsjs/go/main/App'
import { hasStoredThemeId, hasStoredUIThemeId, readStoredTabsState, storedTabKey } from '../../lib/storage'
import { refreshServers, servers$ } from '../../state/servers'
import { refreshRemoteSessions, refreshSessions, sessions$ } from '../../state/sessions'
import { showToast } from '../../state/toasts'
import { setThemeId, setUIThemeId, ui$ } from '../../state/ui'
import { TERMINAL_THEMES } from '../../themes'
import { SYSTEM_UI_THEME_ID, UI_THEMES } from '../../uiThemes'
import {
  attachRemote,
  attachSession,
  getTabs,
  setActiveTabId,
  syncRemoteTabColors,
  tabStorageKey,
} from '../../state/tabs'

let restoredTabsOnce = false
let tmuxCheckedOnce = false

export function AppBootstrap() {
  const servers = useValue(servers$.items)
  const configHosts = useValue(servers$.configHosts)
  const sidebarCollapsed = useValue(ui$.sidebarCollapsed)

  useEffect(() => {
    void refreshServers()
    if (!tmuxCheckedOnce) {
      tmuxCheckedOnce = true
      void IsTmuxAvailable()
        .then((ok) => {
          if (!ok) {
            showToast(
              'warning',
              'tmux not found on your PATH — install tmux to unlock session features.',
              15000,
            )
          }
        })
        .catch(() => {})
    }
    const needsTerminalDefault = !hasStoredThemeId()
    const needsUIDefault = !hasStoredUIThemeId()
    if (needsTerminalDefault || needsUIDefault) {
      void GetSettings()
        .then((settings) => {
          if (needsTerminalDefault) {
            const id = settings.theme
            if (id && TERMINAL_THEMES.some((t) => t.id === id)) setThemeId(id)
          }
          if (needsUIDefault) {
            const id = settings.uiTheme
            const valid = id === SYSTEM_UI_THEME_ID || UI_THEMES.some((t) => t.id === id)
            if (id && valid) setUIThemeId(id)
          }
        })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (restoredTabsOnce) return
    restoredTabsOnce = true

    void (async () => {
      const stored = readStoredTabsState()
      if (stored.tabs.length === 0) return

      await refreshServers()
      await refreshSessions()

      const localSessions = new Set(sessions$.items.peek())
      const remoteServerNames = [
        ...new Set(stored.tabs.flatMap((tab) => (tab.kind === 'remote' ? [tab.serverName] : []))),
      ]
      const remoteSessions = new Map<string, Set<string>>()

      await Promise.all(
        remoteServerNames.map(async (serverName) => {
          try {
            const list = await refreshRemoteSessions(serverName)
            remoteSessions.set(serverName, new Set(list))
          } catch {
            /* ignore unavailable remotes during restore */
          }
        }),
      )

      for (const tab of stored.tabs) {
        if (tab.kind === 'session') {
          if (!localSessions.has(tab.sessionName)) continue
          await attachSession(tab.sessionName)
          continue
        }

        const available = remoteSessions.get(tab.serverName)
        if (!available?.has(tab.sessionName)) continue
        await attachRemote(tab.serverName, tab.sessionName)
      }

      if (!stored.activeTabKey) return
      const activeTab = getTabs().find((tab) => tabStorageKey(tab) === stored.activeTabKey)
      if (activeTab) setActiveTabId(activeTab.id)
    })()
  }, [])

  useEffect(() => {
    if (sidebarCollapsed) return

    let localInterval: number | null = null
    let remoteInterval: number | null = null

    const pollRemotes = () => {
      const connected = Object.keys(sessions$.remote.peek())
      for (const name of connected) {
        void refreshRemoteSessions(name).catch(() => {
          /* ignore transient poll failures */
        })
      }
    }

    const start = () => {
      if (localInterval === null) {
        void refreshSessions()
        localInterval = window.setInterval(() => void refreshSessions(), 5000)
      }
      if (remoteInterval === null) {
        pollRemotes()
        remoteInterval = window.setInterval(pollRemotes, 15000)
      }
    }

    const stop = () => {
      if (localInterval !== null) {
        window.clearInterval(localInterval)
        localInterval = null
      }
      if (remoteInterval !== null) {
        window.clearInterval(remoteInterval)
        remoteInterval = null
      }
    }

    const onFocus = () => start()
    const onBlur = () => stop()

    if (document.hasFocus()) start()
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)

    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      stop()
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    syncRemoteTabColors()
  }, [servers, configHosts])

  return null
}
