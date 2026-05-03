import { useEffect, useRef } from 'react'
import { useValue } from '@legendapp/state/react'
import { Terminal, type FontWeight } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes'
import { GetSettings, PasteClipboardImage, PasteImageData, ResizeTab, WriteTab } from '../../../wailsjs/go/main/App'
import { ClipboardGetText, ClipboardSetText, EventsOn } from '../../../wailsjs/runtime/runtime'
import { isMac, matchAction } from '../../lib/keybindings'
import { getTheme } from '../../themes'
import { ui$ } from '../../state/ui'
import { updateTabLabel } from '../../state/tabs'

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
  tabId: string
  active: boolean
  themeId: string
  onClosed: () => void
}

export function TerminalTab({ tabId, active, themeId, onClosed }: TerminalTabProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
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

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      if (matchAction(event) !== 'terminal.paste') return true
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

    const ro = new ResizeObserver(() => sync())
    ro.observe(hostRef.current)

    const offData = EventsOn(`terminal:data:${tabId}`, (chunk: string) => {
      const bin = atob(chunk)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      terminal.write(bytes)
    })
    const offClosed = EventsOn(`terminal:closed:${tabId}`, () => {
      onClosedRef.current()
    })

    window.setTimeout(sync, 50)

    let disposed = false
    void GetSettings()
      .then((settings) => {
        if (disposed) return
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
      data.dispose()
      title.dispose()
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

  return (
    <div
      ref={hostRef}
      className={`terminal-host absolute inset-0 overflow-hidden ${active ? '' : 'invisible pointer-events-none'}`}
    />
  )
}
