import { useValue } from '@legendapp/state/react'
import { useEffect, useMemo, useRef } from 'react'
import { PaletteDialog } from './PaletteDialog'
import { PaletteList } from './PaletteList'
import {
  closeCommandPalette,
  openAbout,
  openPalette,
  openRemotePalette,
  setCommandPaletteIndex,
  setCommandPaletteMode,
  setCommandPaletteQuery,
  setThemeId,
  setUIThemeId,
  toggleSidebar,
  ui$,
} from '../../state/ui'
import { refreshSessions } from '../../state/sessions'
import { Quit, WindowFullscreen, WindowIsFullscreen, WindowUnfullscreen } from '../../../wailsjs/runtime/runtime'
import { TERMINAL_THEMES } from '../../themes'
import { SYSTEM_UI_THEME_ID, UI_THEMES } from '../../uiThemes'
import { closeTab, getActiveTab } from '../../state/tabs'
import { formatActionParts } from '../../lib/keybindings'
import { KbdShortcut } from '../KbdShortcut'
import { reloadSettings } from '../../lib/reloadSettings'
import { ROOT_COMMAND_ITEMS, filterCommandItems, type CommandItemSpec } from './commandItems'
import { FooterHint } from './FooterHint'

type CommandItem = CommandItemSpec & {
  run: () => void | Promise<void>
  active?: boolean
}

const ROOT_RUNNERS: Record<string, () => void | Promise<void>> = {
  'new-tab': () => {
    closeCommandPalette()
    openPalette('new')
    void refreshSessions()
  },
  'switch-session': () => {
    closeCommandPalette()
    openPalette('switch')
    void refreshSessions()
  },
  'close-tab': () => {
    const active = getActiveTab()
    closeCommandPalette()
    if (active) closeTab(active.id)
  },
  'toggle-sidebar': () => {
    closeCommandPalette()
    toggleSidebar()
  },
  'toggle-fullscreen': () => {
    closeCommandPalette()
    void WindowIsFullscreen().then((isFs) => (isFs ? WindowUnfullscreen() : WindowFullscreen()))
  },
  'change-theme': () => setCommandPaletteMode('theme'),
  'change-ui-theme': () => setCommandPaletteMode('ui-theme'),
  'reload-settings': async () => {
    closeCommandPalette()
    await reloadSettings()
  },
  'connect-new-server': () => {
    closeCommandPalette()
    openRemotePalette(false)
  },
  about: () => {
    closeCommandPalette()
    openAbout()
  },
  'quit-app': () => {
    closeCommandPalette()
    Quit()
  },
}

export function CommandPalette() {
  const open = useValue(ui$.commandPalette.open)
  const mode = useValue(ui$.commandPalette.mode)
  const query = useValue(ui$.commandPalette.query)
  const selectedIndex = useValue(ui$.commandPalette.index)
  const activeThemeId = useValue(ui$.themeId)
  const activeUIThemeId = useValue(ui$.uiThemeId)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const previewBaseThemeIdRef = useRef<string | null>(null)
  const previewCommittedRef = useRef(false)
  const lastPreviewThemeIdRef = useRef<string | null>(null)
  const previewBaseUIThemeIdRef = useRef<string | null>(null)
  const previewCommittedUIRef = useRef(false)
  const lastPreviewUIThemeIdRef = useRef<string | null>(null)
  const previousOpenRef = useRef(open)
  const previousModeRef = useRef(mode)

  const items = useMemo(() => {
    let source: CommandItem[]
    if (mode === 'theme') {
      source = TERMINAL_THEMES.map((theme) => ({
        id: theme.id,
        label: theme.name,
        detail: 'Apply terminal theme',
        aliases: [theme.id, 'theme', 'color scheme'],
        active: theme.id === activeThemeId,
        run: () => {
          previewCommittedRef.current = true
          setThemeId(theme.id)
          closeCommandPalette()
        },
      }))
    } else if (mode === 'ui-theme') {
      const systemEntry: CommandItem = {
        id: SYSTEM_UI_THEME_ID,
        label: 'System',
        detail: 'Follow the OS light/dark preference',
        aliases: ['system', 'auto', 'os'],
        active: SYSTEM_UI_THEME_ID === activeUIThemeId,
        run: () => {
          previewCommittedUIRef.current = true
          setUIThemeId(SYSTEM_UI_THEME_ID)
          closeCommandPalette()
        },
      }
      const themeEntries: CommandItem[] = UI_THEMES.map((theme) => ({
        id: theme.id,
        label: theme.name,
        detail: `Apply UI theme (${theme.colorScheme})`,
        aliases: [theme.id, 'ui', 'theme', theme.colorScheme],
        active: theme.id === activeUIThemeId,
        run: () => {
          previewCommittedUIRef.current = true
          setUIThemeId(theme.id)
          closeCommandPalette()
        },
      }))
      source = [systemEntry, ...themeEntries]
    } else {
      source = ROOT_COMMAND_ITEMS.map((spec) => ({
        ...spec,
        run: ROOT_RUNNERS[spec.id] ?? (() => closeCommandPalette()),
      }))
    }

    return filterCommandItems(source, query)
  }, [activeThemeId, activeUIThemeId, mode, query])

  useEffect(() => {
    if (!open) return
    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }, [open, mode])

  useEffect(() => {
    if (!open) return
    setCommandPaletteIndex(items.length === 0 ? 0 : Math.min(selectedIndex, items.length - 1))
  }, [items.length, open, selectedIndex])

  useEffect(() => {
    const wasOpen = previousOpenRef.current
    const previousMode = previousModeRef.current

    if (open && mode === 'theme' && (!wasOpen || previousMode !== 'theme')) {
      previewBaseThemeIdRef.current = activeThemeId
      previewCommittedRef.current = false
      lastPreviewThemeIdRef.current = null
    }

    if (
      wasOpen &&
      previousMode === 'theme' &&
      (!open || mode !== 'theme') &&
      !previewCommittedRef.current &&
      previewBaseThemeIdRef.current &&
      activeThemeId !== previewBaseThemeIdRef.current
    ) {
      setThemeId(previewBaseThemeIdRef.current)
    }

    if (!open || mode !== 'theme') {
      if (!open) {
        previewBaseThemeIdRef.current = null
        previewCommittedRef.current = false
        lastPreviewThemeIdRef.current = null
      }
      previousOpenRef.current = open
      previousModeRef.current = mode
      return
    }

    const selected = items[selectedIndex]
    if (!selected) {
      if (
        previewBaseThemeIdRef.current &&
        activeThemeId !== previewBaseThemeIdRef.current &&
        !previewCommittedRef.current
      ) {
        setThemeId(previewBaseThemeIdRef.current)
        lastPreviewThemeIdRef.current = previewBaseThemeIdRef.current
      }
      previousOpenRef.current = open
      previousModeRef.current = mode
      return
    }

    if (lastPreviewThemeIdRef.current !== selected.id && activeThemeId !== selected.id) {
      setThemeId(selected.id)
      lastPreviewThemeIdRef.current = selected.id
    }

    previousOpenRef.current = open
    previousModeRef.current = mode
  }, [activeThemeId, items, mode, open, selectedIndex])

  useEffect(() => {
    if (open && mode === 'ui-theme' && previewBaseUIThemeIdRef.current === null) {
      previewBaseUIThemeIdRef.current = activeUIThemeId
      previewCommittedUIRef.current = false
      lastPreviewUIThemeIdRef.current = null
    }

    if (
      previewBaseUIThemeIdRef.current !== null &&
      (!open || mode !== 'ui-theme')
    ) {
      if (!previewCommittedUIRef.current && activeUIThemeId !== previewBaseUIThemeIdRef.current) {
        setUIThemeId(previewBaseUIThemeIdRef.current)
      }
      previewBaseUIThemeIdRef.current = null
      previewCommittedUIRef.current = false
      lastPreviewUIThemeIdRef.current = null
      return
    }

    if (!open || mode !== 'ui-theme') return

    const selected = items[selectedIndex]
    if (!selected) {
      if (
        previewBaseUIThemeIdRef.current &&
        activeUIThemeId !== previewBaseUIThemeIdRef.current &&
        !previewCommittedUIRef.current
      ) {
        setUIThemeId(previewBaseUIThemeIdRef.current)
        lastPreviewUIThemeIdRef.current = previewBaseUIThemeIdRef.current
      }
      return
    }

    if (lastPreviewUIThemeIdRef.current !== selected.id && activeUIThemeId !== selected.id) {
      setUIThemeId(selected.id)
      lastPreviewUIThemeIdRef.current = selected.id
    }
  }, [activeUIThemeId, items, mode, open, selectedIndex])

  const title =
    mode === 'theme' ? 'Change theme' : mode === 'ui-theme' ? 'Change UI theme' : 'Command palette'
  const placeholder =
    mode === 'theme'
      ? 'Search themes'
      : mode === 'ui-theme'
        ? 'Search UI themes'
        : 'Type a command or search'
  const overlayClassName =
    mode === 'theme' || mode === 'ui-theme'
      ? 'fixed inset-0 grid place-items-start justify-center pt-18 max-[720px]:pt-7 bg-transparent z-20'
      : 'fixed inset-0 grid place-items-start justify-center pt-18 max-[720px]:pt-7 bg-overlay backdrop-blur-md z-20'

  const handleSubmit = async () => {
    const selected = items[selectedIndex]
    if (!selected) return
    await selected.run()
  }
  const selectedItem = items[selectedIndex] ?? null

  return (
    <PaletteDialog
      open={open}
      onClose={closeCommandPalette}
      ariaLabel="Command palette"
      overlayClassName={overlayClassName}
      panelClassName="w-[min(640px,calc(100vw-32px))] bg-surface border border-border shadow-[0_18px_60px_rgba(0,0,0,0.30)] rounded-xl overflow-hidden"
      header={
        <div className="px-4 pt-3 pb-2 border-b border-border">
          <div className="text-[10px] uppercase tracking-[0.1em] text-foreground-subtle mb-1.5">{title}</div>
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-accent-soft text-accent text-xs shrink-0">
              &gt;
            </span>
            <input
              ref={inputRef}
              className="w-full bg-transparent border-0 outline-0 text-foreground-strong font-[inherit] text-sm placeholder:text-foreground-subtle"
              value={query}
              onChange={(event) => setCommandPaletteQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleSubmit()
                }
              }}
              placeholder={placeholder}
            />
          </div>
        </div>
      }
      body={
        <PaletteList
          items={items}
          selectedIndex={selectedIndex}
          onSelectIndex={setCommandPaletteIndex}
          onActivate={(item) => item.run()}
          getKey={(item) => item.id}
          className="p-2 max-h-[min(50vh,420px)] overflow-auto"
          empty={<div className="px-3.5 py-4 text-foreground-subtle text-xs">No matching commands.</div>}
          renderItem={(item, { selected }) => {
            const isActive = item.active === true
            const shortcutParts = item.shortcut ? formatActionParts(item.shortcut) : null
            return (
              <div
                className={`w-full flex items-center gap-2.5 border-0 cursor-pointer px-3 py-2.5 rounded-lg text-left ${
                  selected
                    ? 'bg-accent-soft text-foreground-strong'
                    : 'bg-transparent text-foreground hover:bg-accent-soft hover:text-foreground-strong'
                }`}
              >
                <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[13px]">
                  {item.label}
                </span>
                {isActive ? <span className="text-foreground-subtle text-[10px] tracking-[0.08em] uppercase">active</span> : null}
                {shortcutParts ? (
                  <KbdShortcut
                    parts={shortcutParts}
                    className="text-foreground-subtle text-[11px] font-medium px-1.5 py-0.5 rounded border border-border bg-elevated"
                  />
                ) : null}
              </div>
            )
          }}
        />
      }
      footer={
        <div className="flex items-center gap-4 px-3.5 pt-2.5 pb-3 border-t border-border max-[720px]:flex-wrap max-[720px]:gap-y-2">
          <span className="flex-1 min-w-0 text-[11px] text-foreground-subtle whitespace-nowrap overflow-hidden text-ellipsis">
            {selectedItem?.detail ?? 'Select a command'}
          </span>
          <FooterHint keyLabel="Enter" action="run" />
          <FooterHint keyLabel="Esc" action="close" />
          <FooterHint keyLabel="↑↓" action="navigate" />
        </div>
      }
    />
  )
}
