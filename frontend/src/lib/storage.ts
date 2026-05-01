import { DEFAULT_THEME_ID } from '../themes'
import { SYSTEM_UI_THEME_ID } from '../uiThemes'
import { remoteKey } from './session'

export const THEME_STORAGE_KEY = 'tmiix.terminal.theme'
export const UI_THEME_STORAGE_KEY = 'tmiix.ui.theme'
export const SIDEBAR_STORAGE_KEY = 'tmiix.sidebar.collapsed'
export const RECENT_SESSIONS_STORAGE_KEY = 'tmiix.recent.sessions'
export const LOCAL_COLOR_STORAGE_KEY = 'tmiix.local.color'
export const TABS_STORAGE_KEY = 'tmiix.tabs'
export const MAX_RECENT_SESSIONS = 8

export type StoredTab =
  | { kind: 'session'; sessionName: string }
  | { kind: 'remote'; serverName: string; sessionName: string }

export interface StoredTabsState {
  tabs: StoredTab[]
  activeTabKey: string | null
}

export function readStoredSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function readStoredLocalColor(): string | null {
  try {
    return window.localStorage.getItem(LOCAL_COLOR_STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeStoredLocalColor(color: string | null) {
  try {
    if (color) {
      window.localStorage.setItem(LOCAL_COLOR_STORAGE_KEY, color)
    } else {
      window.localStorage.removeItem(LOCAL_COLOR_STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function readStoredThemeId(): string {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored) return stored
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_THEME_ID
}

export function hasStoredThemeId(): boolean {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

export function readStoredUIThemeId(): string {
  try {
    const stored = window.localStorage.getItem(UI_THEME_STORAGE_KEY)
    if (stored) return stored
  } catch {
    /* localStorage unavailable */
  }
  return SYSTEM_UI_THEME_ID
}

export function hasStoredUIThemeId(): boolean {
  try {
    return window.localStorage.getItem(UI_THEME_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

export function readStoredRecentSessions(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SESSIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function updateRecentSessions(recentSessions: string[], sessionName: string): string[] {
  return [sessionName, ...recentSessions.filter((name) => name !== sessionName)].slice(0, MAX_RECENT_SESSIONS)
}

export function storedTabKey(tab: StoredTab): string {
  return tab.kind === 'session' ? `session:${tab.sessionName}` : `remote:${remoteKey(tab.serverName, tab.sessionName)}`
}

export function readStoredTabsState(): StoredTabsState {
  try {
    const raw = window.localStorage.getItem(TABS_STORAGE_KEY)
    if (!raw) return { tabs: [], activeTabKey: null }

    const parsed = JSON.parse(raw) as Partial<StoredTabsState> | null
    const tabs = Array.isArray(parsed?.tabs)
      ? parsed.tabs.flatMap((tab): StoredTab[] => {
          if (!tab || typeof tab !== 'object') return []
          if (tab.kind === 'session' && typeof tab.sessionName === 'string' && tab.sessionName) {
            return [{ kind: 'session', sessionName: tab.sessionName }]
          }
          if (
            tab.kind === 'remote' &&
            typeof tab.serverName === 'string' &&
            tab.serverName &&
            typeof tab.sessionName === 'string' &&
            tab.sessionName
          ) {
            return [
              {
                kind: 'remote',
                serverName: tab.serverName,
                sessionName: tab.sessionName,
              },
            ]
          }
          return []
        })
      : []

    return {
      tabs,
      activeTabKey: typeof parsed?.activeTabKey === 'string' ? parsed.activeTabKey : null,
    }
  } catch {
    return { tabs: [], activeTabKey: null }
  }
}

export function writeStoredTabsState(state: StoredTabsState) {
  try {
    window.localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}
