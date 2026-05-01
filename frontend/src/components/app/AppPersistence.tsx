import { useValue } from '@legendapp/state/react'
import { useEffect } from 'react'
import {
  RECENT_SESSIONS_STORAGE_KEY,
  SIDEBAR_STORAGE_KEY,
  THEME_STORAGE_KEY,
  UI_THEME_STORAGE_KEY,
  writeStoredTabsState,
} from '../../lib/storage'
import { getTheme } from '../../themes'
import { applyUITheme, watchSystemUITheme } from '../../uiThemes'
import { sessions$ } from '../../state/sessions'
import { tabStorageKey, tabs$, toStoredTab } from '../../state/tabs'
import { ui$ } from '../../state/ui'

export function AppPersistence() {
  const sidebarCollapsed = useValue(ui$.sidebarCollapsed)
  const recentSessions = useValue(sessions$.recent)
  const themeId = useValue(ui$.themeId)
  const uiThemeId = useValue(ui$.uiThemeId)
  const tabs = useValue(tabs$.items)
  const activeTabId = useValue(tabs$.activeTabId)

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    try {
      window.localStorage.setItem(RECENT_SESSIONS_STORAGE_KEY, JSON.stringify(recentSessions))
    } catch {
      /* ignore */
    }
  }, [recentSessions])

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeId)
    } catch {
      /* ignore */
    }

    document.documentElement.style.setProperty('--terminal-bg', getTheme(themeId).theme.background ?? '#0d1117')
  }, [themeId])

  useEffect(() => {
    try {
      window.localStorage.setItem(UI_THEME_STORAGE_KEY, uiThemeId)
    } catch {
      /* ignore */
    }
    applyUITheme(uiThemeId)
  }, [uiThemeId])

  useEffect(() => {
    return watchSystemUITheme(() => ui$.uiThemeId.peek())
  }, [])

  useEffect(() => {
    const storedTabs = tabs.flatMap((tab) => {
      const stored = toStoredTab(tab)
      return stored ? [stored] : []
    })
    const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
    writeStoredTabsState({
      tabs: storedTabs,
      activeTabKey: activeTab ? tabStorageKey(activeTab) : null,
    })
  }, [activeTabId, tabs])

  return null
}
