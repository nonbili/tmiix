import { observable } from '@legendapp/state'
import {
  readStoredLocalColor,
  readStoredSidebarCollapsed,
  readStoredThemeId,
  readStoredUIThemeId,
  writeStoredLocalColor,
} from '../lib/storage'
import { refreshServers } from './servers'

export const ui$ = observable({
  themeId: readStoredThemeId(),
  uiThemeId: readStoredUIThemeId(),
  localColor: readStoredLocalColor(),
  sidebarCollapsed: readStoredSidebarCollapsed(),
  askpass: {
    open: false,
    id: '',
    prompt: '',
    error: '',
    submitting: false,
  },
  palette: {
    open: false,
    mode: 'new' as 'new' | 'switch',
    query: '',
    index: 0,
  },
  commandPalette: {
    open: false,
    mode: 'root' as 'root' | 'theme' | 'ui-theme',
    query: '',
    index: 0,
  },
  remotePalette: {
    open: false,
    connectMode: false,
  },
  aboutOpen: false,
  shortcutsOpen: false,
  confirm: {
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    destructive: false,
  },
})

let confirmResolver: ((value: boolean) => void) | null = null

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export function requestConfirm(options: ConfirmOptions): Promise<boolean> {
  confirmResolver?.(false)
  ui$.confirm.set({
    open: true,
    title: options.title ?? '',
    message: options.message,
    confirmLabel: options.confirmLabel ?? 'Confirm',
    cancelLabel: options.cancelLabel ?? 'Cancel',
    destructive: options.destructive ?? false,
  })
  return new Promise<boolean>((resolve) => {
    confirmResolver = resolve
  })
}

export function resolveConfirm(value: boolean) {
  ui$.confirm.open.set(false)
  const resolve = confirmResolver
  confirmResolver = null
  resolve?.(value)
}

export function toggleSidebar() {
  ui$.sidebarCollapsed.set((collapsed) => !collapsed)
}

export function setThemeId(themeId: string) {
  ui$.themeId.set(themeId)
}

export function setUIThemeId(themeId: string) {
  ui$.uiThemeId.set(themeId)
}

export function setLocalColor(color: string | null) {
  ui$.localColor.set(color)
  writeStoredLocalColor(color)
}

export function openAbout() {
  ui$.aboutOpen.set(true)
}

export function closeAbout() {
  ui$.aboutOpen.set(false)
}

export function openShortcuts() {
  ui$.shortcutsOpen.set(true)
}

export function closeShortcuts() {
  ui$.shortcutsOpen.set(false)
}

export function showAskpassPrompt(id: string, prompt: string) {
  ui$.askpass.set({
    open: true,
    id,
    prompt,
    error: '',
    submitting: false,
  })
}

export function setAskpassSubmitting(submitting: boolean) {
  ui$.askpass.submitting.set(submitting)
}

export function setAskpassError(error: string) {
  ui$.askpass.error.set(error)
}

export function closeAskpassPrompt() {
  ui$.askpass.set({
    open: false,
    id: '',
    prompt: '',
    error: '',
    submitting: false,
  })
}

export function openPalette(mode: 'new' | 'switch' = 'new') {
  ui$.palette.mode.set(mode)
  ui$.palette.open.set(true)
  ui$.palette.query.set('')
  ui$.palette.index.set(0)
}

export function closePalette() {
  ui$.palette.open.set(false)
}

export function setPaletteQuery(query: string) {
  ui$.palette.query.set(query)
  ui$.palette.index.set(0)
}

export function setPaletteIndex(index: number) {
  ui$.palette.index.set(index)
}

export type CommandPaletteMode = 'root' | 'theme' | 'ui-theme'

export function openCommandPalette(mode: CommandPaletteMode = 'root') {
  ui$.commandPalette.mode.set(mode)
  ui$.commandPalette.open.set(true)
  ui$.commandPalette.query.set('')
  ui$.commandPalette.index.set(0)
}

export function closeCommandPalette() {
  ui$.commandPalette.open.set(false)
}

export function setCommandPaletteMode(mode: CommandPaletteMode) {
  ui$.commandPalette.mode.set(mode)
  ui$.commandPalette.query.set('')
  ui$.commandPalette.index.set(0)
}

export function setCommandPaletteQuery(query: string) {
  ui$.commandPalette.query.set(query)
  ui$.commandPalette.index.set(0)
}

export function setCommandPaletteIndex(index: number) {
  ui$.commandPalette.index.set(index)
}

export function openRemotePalette(connectMode = false) {
  ui$.remotePalette.open.set(true)
  ui$.remotePalette.connectMode.set(connectMode)
  void refreshServers()
}

export function closeRemotePalette() {
  ui$.remotePalette.open.set(false)
}
