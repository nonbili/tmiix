import { useValue } from '@legendapp/state/react'
import { useEffect } from 'react'
import { WindowFullscreen, WindowIsFullscreen, WindowUnfullscreen } from '../../../wailsjs/runtime/runtime'
import { matchAction } from '../../lib/keybindings'
import { servers$ } from '../../state/servers'
import { getPaletteItems, refreshSessions, sessions$ } from '../../state/sessions'
import { closeTab, cycleActiveTab, getActiveTab, setActiveTabId, tabs$ } from '../../state/tabs'
import { TERMINAL_THEMES } from '../../themes'
import { UI_THEMES } from '../../uiThemes'
import { ROOT_COMMAND_ITEMS, filterCommandItems } from '../palette/commandItems'
import {
  closeCommandPalette,
  closePalette,
  openCommandPalette,
  openPalette,
  setCommandPaletteIndex,
  setPaletteIndex,
  toggleSidebar,
  ui$,
} from '../../state/ui'

function getCommandPaletteItemCount(mode: 'root' | 'theme' | 'ui-theme', query: string) {
  let items: { label: string; detail: string; aliases: string[] }[]
  if (mode === 'theme') {
    items = TERMINAL_THEMES.map((theme) => ({
      label: theme.name,
      detail: 'Apply terminal theme',
      aliases: [theme.id, 'theme', 'color scheme'],
    }))
  } else if (mode === 'ui-theme') {
    items = [
      { label: 'System', detail: 'Follow the OS light/dark preference', aliases: ['system', 'auto', 'os'] },
      ...UI_THEMES.map((theme) => ({
        label: theme.name,
        detail: `Apply UI theme (${theme.colorScheme})`,
        aliases: [theme.id, 'ui', 'theme', theme.colorScheme],
      })),
    ]
  } else {
    items = ROOT_COMMAND_ITEMS
  }
  return filterCommandItems(items, query).length
}

export function AppHotkeys() {
  const paletteOpen = useValue(ui$.palette.open)
  const commandPaletteOpen = useValue(ui$.commandPalette.open)
  const paletteQuery = useValue(ui$.palette.query)
  const commandPaletteQuery = useValue(ui$.commandPalette.query)
  const commandPaletteMode = useValue(ui$.commandPalette.mode)
  const savedServers = useValue(servers$.items)
  const recentSessions = useValue(sessions$.recent)
  const sessions = useValue(sessions$.items)
  const remoteSessions = useValue(sessions$.remote)
  const tabs = useValue(tabs$.items)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = matchAction(event)
      if (action?.startsWith('tab.select.')) {
        const index = parseInt(action.slice('tab.select.'.length), 10) - 1
        const tabs = tabs$.items.peek()
        if (index < tabs.length) {
          event.preventDefault()
          event.stopPropagation()
          setActiveTabId(tabs[index].id)
        }
        return
      }
      if (action === 'tab.close') {
        event.preventDefault()
        event.stopPropagation()
        const activeTab = getActiveTab()
        if (activeTab) closeTab(activeTab.id)
        return
      }
      if (action === 'tab.cycle.next') {
        event.preventDefault()
        event.stopPropagation()
        cycleActiveTab(1)
        return
      }
      if (action === 'tab.cycle.prev') {
        event.preventDefault()
        event.stopPropagation()
        cycleActiveTab(-1)
        return
      }

      if (action === 'palette.command') {
        event.preventDefault()
        event.stopPropagation()
        if (ui$.commandPalette.open.peek()) closeCommandPalette()
        else {
          closePalette()
          openCommandPalette('root')
        }
        return
      }
      if (action === 'palette.switch') {
        event.preventDefault()
        event.stopPropagation()
        if (ui$.palette.open.peek()) closePalette()
        else {
          closeCommandPalette()
          openPalette('switch')
          void refreshSessions()
        }
        return
      }
      if (action === 'palette.new') {
        event.preventDefault()
        event.stopPropagation()
        if (ui$.palette.open.peek()) closePalette()
        else {
          closeCommandPalette()
          openPalette('new')
          void refreshSessions()
        }
        return
      }
      if (action === 'sidebar.toggle') {
        event.preventDefault()
        event.stopPropagation()
        toggleSidebar()
        return
      }
      if (action === 'window.fullscreen') {
        event.preventDefault()
        event.stopPropagation()
        void WindowIsFullscreen().then((isFullscreen) => {
          if (isFullscreen) WindowUnfullscreen()
          else WindowFullscreen()
        })
        return
      }

      if (ui$.commandPalette.open.peek()) {
        const commandItems = getCommandPaletteItemCount(ui$.commandPalette.mode.peek(), ui$.commandPalette.query.peek())

        if (event.key === 'Escape') {
          event.preventDefault()
          closeCommandPalette()
          return
        }

        if (event.key === 'ArrowDown' || (event.ctrlKey && event.key.toLowerCase() === 'n')) {
          event.preventDefault()
          setCommandPaletteIndex(commandItems === 0 ? 0 : (ui$.commandPalette.index.peek() + 1) % commandItems)
          return
        }

        if (event.key === 'ArrowUp' || (event.ctrlKey && event.key.toLowerCase() === 'p')) {
          event.preventDefault()
          setCommandPaletteIndex(
            commandItems === 0 ? 0 : (ui$.commandPalette.index.peek() - 1 + commandItems) % commandItems,
          )
          return
        }
      }

      if (!ui$.palette.open.peek()) return

      const paletteSessions = getPaletteItems()

      if (event.key === 'Escape') {
        event.preventDefault()
        closePalette()
        return
      }

      if (event.key === 'ArrowDown' || (event.ctrlKey && event.key.toLowerCase() === 'n')) {
        event.preventDefault()
        setPaletteIndex(paletteSessions.length === 0 ? 0 : (ui$.palette.index.peek() + 1) % paletteSessions.length)
        return
      }

      if (event.key === 'ArrowUp' || (event.ctrlKey && event.key.toLowerCase() === 'p')) {
        event.preventDefault()
        setPaletteIndex(
          paletteSessions.length === 0
            ? 0
            : (ui$.palette.index.peek() - 1 + paletteSessions.length) % paletteSessions.length,
        )
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [
    commandPaletteMode,
    commandPaletteOpen,
    commandPaletteQuery,
    savedServers,
    paletteOpen,
    paletteQuery,
    recentSessions,
    sessions,
    remoteSessions,
    tabs,
  ])

  return null
}
