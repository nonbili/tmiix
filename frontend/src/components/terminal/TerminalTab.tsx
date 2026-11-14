import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { useValue } from '@legendapp/state/react'
import { Terminal, type FontWeight } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes'
import { GetSettings, PasteClipboardImage, PasteImageData, ResizeTab, WriteTab } from '../../../bindings/tmiix/app'
import { ClipboardGetText, ClipboardSetText, EventsOn } from '../../lib/runtime'
import { isMac, matchAction } from '../../lib/keybindings'
import { getTheme } from '../../themes'
import { ui$ } from '../../state/ui'
import { canOpenTmuxHere, checkTabForSession, openTmuxHere, reconnectTab, updateTabLabel } from '../../state/tabs'
import type { Tab } from '../../types'
import { useContextMenu } from '../../lib/useContextMenu'
import { SidebarSectionMenu, type SectionMenuItem } from '../sidebar/SidebarSectionMenu'

const XTERM_SECONDARY_DA_RESPONSE = '[>0;276;0c'
const ENABLE_WEBGL = !isMac
const DEFAULT_FONT = {
  family: '"JetBrains Mono", "SF Mono", "Menlo", "Consolas", monospace',
  size: 13,
  lineHeight: 1,
  letterSpacing: 0,
  weight: '400' as FontWeight,
  boldWeight: '700' as FontWeight,
}

async function handleTerminalPaste(tabId: string, terminal: Terminal) {
  try {
    const path = await PasteClipboardImage(tabId)
    if (path) {
      terminal.paste(path)
      return
    }
  } catch (err) {
    console.error('[tmiix paste] image failed', err)
  }
  try {
    const text = await ClipboardGetText()
    if (text) terminal.paste(text)
  } catch (err) {
    console.error('[tmiix paste] text failed', err)
  }
}

function clipboardImageFile(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items
  if (!items) return null
  for (const item of items) {
    if (!item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) return file
  }
  return null
}

function imageExtFromMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/bmp':
      return 'bmp'
    case 'image/png':
    default:
      return 'png'
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function handleImagePaste(tabId: string, terminal: Terminal, file: File) {
  console.log('[tmiix paste] image file detected', { tabId, type: file.type, size: file.size })
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    console.log('[tmiix paste] image bytes read', { tabId, bytes: bytes.length })
    const path = await PasteImageData(tabId, bytesToBase64(bytes), imageExtFromMime(file.type))
    console.log('[tmiix paste] image staged', { tabId, path })
    if (path) terminal.paste(path)
  } catch (err) {
    console.error('[tmiix paste] image failed', err)
  }
}

async function handlePasteEvent(tabId: string, terminal: Terminal, event: ClipboardEvent) {
  console.log('[tmiix paste] paste event', { tabId })
  event.preventDefault()
  event.stopPropagation()

  const file = clipboardImageFile(event)
  if (file) {
    await handleImagePaste(tabId, terminal, file)
    return
  }

  console.log('[tmiix paste] no image file in paste event; trying native clipboard image', { tabId })
  try {
    const path = await PasteClipboardImage(tabId)
    console.log('[tmiix paste] native clipboard image path', { tabId, path })
    if (path) {
      terminal.paste(path)
      return
    }
  } catch (err) {
    console.error('[tmiix paste] native clipboard image failed', err)
  }

  const eventText = event.clipboardData?.getData('text/plain') ?? ''
  console.log('[tmiix paste] falling back to text paste', { tabId, eventTextLength: eventText.length })
  if (eventText) {
    terminal.paste(eventText)
    return
  }

  try {
    const text = await ClipboardGetText()
    console.log('[tmiix paste] runtime clipboard text fallback', { tabId, textLength: text?.length ?? 0 })
    if (text) terminal.paste(text)
  } catch (err) {
    console.error('[tmiix paste] text failed', err)
  }
}

interface TerminalTabProps {
  tab: Tab
  tabId: string
  active: boolean
  themeId: string
  onClosed: (clean: boolean) => void
}

export function TerminalTab({ tab, tabId, active, themeId, onClosed }: TerminalTabProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const menu = useContextMenu()
  const onClosedRef = useRef(onClosed)
  onClosedRef.current = onClosed
  const paletteOpen = useValue(ui$.palette.open)
  const commandPaletteOpen = useValue(ui$.commandPalette.open)
  const remotePaletteOpen = useValue(ui$.remotePalette.open)
  const overlayOpen = paletteOpen || commandPaletteOpen || remotePaletteOpen

  useEffect(() => {
    if (!hostRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: DEFAULT_FONT.family,
      fontSize: DEFAULT_FONT.size,
      lineHeight: DEFAULT_FONT.lineHeight,
      letterSpacing: DEFAULT_FONT.letterSpacing,
      fontWeight: DEFAULT_FONT.weight,
      fontWeightBold: DEFAULT_FONT.boldWeight,
      theme: getTheme(themeId).theme,
      allowTransparency: false,
      convertEol: false,
      drawBoldTextInBrightColors: false,
      scrollback: 5000,
      allowProposedApi: true,
    })

    const fit = new FitAddon()
    terminal.loadAddon(fit)

    try {
      const unicodeGraphemesAddon = new UnicodeGraphemesAddon()
      terminal.loadAddon(unicodeGraphemesAddon)
      if (terminal.unicode) {
        terminal.unicode.activeVersion = '15-graphemes'
      }
    } catch (e) {
      console.error('Failed to load UnicodeGraphemesAddon:', e)
    }

    terminal.open(hostRef.current)

    const pasteTarget = hostRef.current
    const onPaste = (event: ClipboardEvent) => {
      void handlePasteEvent(tabId, terminal, event)
    }
    pasteTarget.addEventListener('paste', onPaste, true)

    // Forward mouse drag (held motion) and release to tmux even when the
    // mouse protocol was enabled *after* mousedown. xterm.js only attaches
    // its document-level mousemove/mouseup listeners at mousedown time, so
    // when an app like tmux turns on 1002/1003 in response to the right-
    // click that opened a display-menu, motion-while-held AND the eventual
    // release are otherwise lost (broken hover highlight; slow menu commit).
    // xterm dedupes via its own _lastEvent, so this won't double-send.
    const sendCoreMouse = (ev: MouseEvent, button: number, action: number) => {
      const core = (terminal as unknown as { _core: any })._core
      const coreMouseService = core?.coreMouseService
      const mouseService = core?._mouseService
      const screenElement = core?.screenElement
      if (!coreMouseService?.areMouseEventsActive || !mouseService || !screenElement) return
      const pos = mouseService.getMouseReportCoords(ev, screenElement)
      if (!pos) return
      coreMouseService.triggerMouseEvent({
        col: pos.col,
        row: pos.row,
        x: pos.x,
        y: pos.y,
        button,
        action,
        ctrl: ev.ctrlKey,
        alt: ev.altKey,
        shift: ev.shiftKey,
      })
    }
    const onDocDragMotion = (ev: MouseEvent) => {
      if (!ev.buttons) return
      const button = ev.buttons & 1 ? 0 /* LEFT */ : ev.buttons & 4 ? 1 /* MIDDLE */ : ev.buttons & 2 ? 2 /* RIGHT */ : 3 /* NONE */
      if (button === 3) return
      sendCoreMouse(ev, button, 32 /* MOVE */)
    }
    const onDocMouseUp = (ev: MouseEvent) => {
      const button = ev.button < 3 ? ev.button : 3 /* NONE */
      if (button === 3) return
      sendCoreMouse(ev, button, 0 /* UP */)
    }
    document.addEventListener('mousemove', onDocDragMotion)
    document.addEventListener('mouseup', onDocMouseUp)

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      const action = matchAction(event)
      if (action === 'terminal.copy') {
        if (!terminal.hasSelection()) return true
        event.preventDefault()
        void ClipboardSetText(terminal.getSelection())
        return false
      }
      if (action !== 'terminal.paste') return true
      event.preventDefault()
      void handleTerminalPaste(tabId, terminal)
      return false
    })

    terminal.parser.registerOscHandler(52, (data) => {
      const semi = data.indexOf(';')
      if (semi < 0) return true
      const payload = data.slice(semi + 1)
      if (payload === '?') return true
      try {
        const bin = atob(payload)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const text = new TextDecoder().decode(bytes)
        void ClipboardSetText(text)
      } catch {
        // ignore malformed base64
      }
      return true
    })

    if (ENABLE_WEBGL) {
      try {
        const webgl = new WebglAddon(true)
        webgl.onContextLoss(() => webgl.dispose())
        terminal.loadAddon(webgl)
      } catch {
        // WebGL unavailable; fall back to default renderer.
      }
    }

    fit.fit()

    termRef.current = terminal
    fitRef.current = fit

    const sync = () => {
      fit.fit()
      const d = fit.proposeDimensions()
      if (d) void ResizeTab(tabId, d.cols, d.rows)
    }

    const data = terminal.onData((d) => {
      if (d === XTERM_SECONDARY_DA_RESPONSE) return
      void WriteTab(tabId, d)
    })

    const title = terminal.onTitleChange((t) => {
      if (t) updateTabLabel(tabId, t)
    })

    // A shell tab entering the alternate screen means a full-screen program
    // just started — possibly a tmux client the app doesn't know about yet
    // (e.g. `tmux new-session` typed by hand or run by a ~/bin script).
    const buffer = terminal.buffer.onBufferChange((buf) => {
      if (buf.type === 'alternate') checkTabForSession(tabId)
    })

    // Debounced so a drag-in-progress doesn't spam the clipboard bridge, and
    // guarded so clearing the selection never wipes the clipboard.
    let copyOnSelect = false
    let copyOnSelectTimer: number | undefined
    const selection = terminal.onSelectionChange(() => {
      if (!copyOnSelect) return
      window.clearTimeout(copyOnSelectTimer)
      copyOnSelectTimer = window.setTimeout(() => {
        const text = terminal.getSelection()
        if (text) void ClipboardSetText(text)
      }, 150)
    })

    const ro = new ResizeObserver(() => sync())
    ro.observe(hostRef.current)

    const offData = EventsOn(`terminal:data:${tabId}`, (chunk: string) => {
      const bin = atob(chunk)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      terminal.write(bytes)
    })
    const offClosed = EventsOn(`terminal:closed:${tabId}`, (clean: boolean) => {
      onClosedRef.current(clean ?? true)
    })

    window.setTimeout(sync, 50)

    let disposed = false
    void GetSettings()
      .then((settings) => {
        if (disposed) return
        copyOnSelect = settings.copyOnSelect ?? false
        terminal.options.fontFamily = settings.font?.family || DEFAULT_FONT.family
        terminal.options.fontSize = settings.font?.size || DEFAULT_FONT.size
        terminal.options.lineHeight = settings.font?.lineHeight || DEFAULT_FONT.lineHeight
        terminal.options.letterSpacing = settings.font?.letterSpacing ?? DEFAULT_FONT.letterSpacing
        terminal.options.fontWeight = DEFAULT_FONT.weight
        terminal.options.fontWeightBold = DEFAULT_FONT.boldWeight
        terminal.clearTextureAtlas?.()
        sync()
      })
      .catch(() => {})

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        terminal.clearTextureAtlas?.()
        sync()
      })
    }

    return () => {
      disposed = true
      ro.disconnect()
      pasteTarget.removeEventListener('paste', onPaste, true)
      document.removeEventListener('mousemove', onDocDragMotion)
      document.removeEventListener('mouseup', onDocMouseUp)
      data.dispose()
      title.dispose()
      buffer.dispose()
      window.clearTimeout(copyOnSelectTimer)
      selection.dispose()
      offData()
      offClosed()
      terminal.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = getTheme(themeId).theme
  }, [themeId])

  useEffect(() => {
    if (!active) return
    if (overlayOpen) return
    const id = window.setTimeout(() => {
      const fit = fitRef.current
      const term = termRef.current
      if (term) {
        term.clearTextureAtlas?.()
        term.refresh(0, term.rows - 1)
      }
      if (fit) {
        fit.fit()
        const d = fit.proposeDimensions()
        if (d) void ResizeTab(tabId, d.cols, d.rows)
      }
      term?.focus()
    }, 0)
    return () => window.clearTimeout(id)
  }, [active, tabId, overlayOpen])

  // After a reconnect re-attaches, the new pty starts at a default size; nudge
  // a resize so tmux/the remote shell repaints at the real terminal dimensions.
  useEffect(() => {
    if (tab.status !== 'connected') return
    const id = window.setTimeout(() => {
      const fit = fitRef.current
      const term = termRef.current
      if (fit) {
        fit.fit()
        const d = fit.proposeDimensions()
        if (d) void ResizeTab(tabId, d.cols, d.rows)
      }
      if (active) term?.focus()
    }, 50)
    return () => window.clearTimeout(id)
  }, [tab.status, tabId, active])

  const contextItems: SectionMenuItem[] = canOpenTmuxHere(tab)
    ? [{ kind: 'button', label: 'Open tmux session here', onClick: () => void openTmuxHere(tab.id) }]
    : []
  const handleContextMenu = (event: ReactMouseEvent) => {
    if (active && contextItems.length > 0) {
      menu.onContextMenu(event)
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div
      className={`absolute inset-0 ${active ? '' : 'invisible pointer-events-none'}`}
      onContextMenu={handleContextMenu}
    >
      <div ref={hostRef} className="terminal-host absolute inset-0 overflow-hidden" />
      {tab.status === 'reconnecting' || tab.status === 'disconnected' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface/95 px-6 py-5 text-center shadow-lg">
            {tab.status === 'reconnecting' ? (
              <>
                <span className="w-5 h-5 rounded-full border-2 border-border-strong border-t-transparent animate-spin" />
                <div className="text-sm text-foreground">
                  Reconnecting…
                  {tab.reconnectAttempt ? (
                    <span className="text-foreground-muted"> (attempt {tab.reconnectAttempt})</span>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-foreground-strong">Connection lost</div>
                <div className="text-xs text-foreground-muted max-w-[240px]">
                  Couldn't reach {tab.serverName ?? 'the server'} after several attempts.
                </div>
                <button
                  className="mt-1 inline-flex items-center justify-center rounded-[6px] border border-accent-muted/60 bg-accent-soft px-3 py-1.5 text-xs text-foreground-strong hover:bg-accent-soft/80 transition-colors"
                  style={{ '--wails-draggable': 'no-drag' } as any}
                  onClick={() => reconnectTab(tabId)}
                  type="button"
                >
                  Reconnect
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {active && menu.open && contextItems.length > 0 ? (
        <SidebarSectionMenu items={contextItems} position={menu.position} innerRef={menu.ref} onClose={menu.close} />
      ) : null}
    </div>
  )
}
