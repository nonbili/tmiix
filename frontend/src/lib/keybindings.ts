import { GetKeybindings } from '../../wailsjs/go/main/App'

export type KeybindingAction =
  | 'palette.switch'
  | 'palette.command'
  | 'palette.new'
  | 'sidebar.toggle'
  | 'terminal.paste'
  | 'tab.close'
  | 'tab.cycle.next'
  | 'tab.cycle.prev'
  | 'tab.select.1'
  | 'tab.select.2'
  | 'tab.select.3'
  | 'tab.select.4'
  | 'tab.select.5'
  | 'tab.select.6'
  | 'tab.select.7'
  | 'tab.select.8'
  | 'tab.select.9'
  | 'window.fullscreen'

export type KeyChord = {
  key: string
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  mod: boolean
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const META_KEYS = new Set(['meta', 'os', 'super', 'hyper', 'command'])
const CTRL_KEYS = new Set(['control'])

let heldMeta = false
let heldCtrl = false

function isMetaKey(event: KeyboardEvent) {
  return META_KEYS.has(event.key.toLowerCase())
}

function isCtrlKey(event: KeyboardEvent) {
  return CTRL_KEYS.has(event.key.toLowerCase())
}

function hasMeta(event: KeyboardEvent) {
  return (
    event.metaKey ||
    heldMeta ||
    event.getModifierState('Meta') ||
    event.getModifierState('OS') ||
    event.getModifierState('Super') ||
    event.getModifierState('Hyper')
  )
}

function hasCtrl(event: KeyboardEvent) {
  return event.ctrlKey || heldCtrl || event.getModifierState('Control')
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'keyup',
    (event) => {
      if (isMetaKey(event)) heldMeta = false
      if (isCtrlKey(event)) heldCtrl = false
    },
    true,
  )
  window.addEventListener('blur', () => {
    heldMeta = false
    heldCtrl = false
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      heldMeta = false
      heldCtrl = false
    }
  })
}

export function parseChord(chord: string): KeyChord | null {
  const parts = chord
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const result: KeyChord = {
    key: '',
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
    mod: false,
  }
  for (const part of parts) {
    const lower = part.toLowerCase()
    switch (lower) {
      case 'mod':
        result.mod = true
        break
      case 'ctrl':
      case 'control':
        result.ctrl = true
        break
      case 'cmd':
      case 'command':
      case 'meta':
      case 'super':
        result.meta = true
        break
      case 'alt':
      case 'option':
        result.alt = true
        break
      case 'shift':
        result.shift = true
        break
      default:
        result.key = lower
    }
  }
  if (!result.key) return null
  return result
}

function chordMatchesEvent(chord: KeyChord, event: KeyboardEvent): boolean {
  const wantCtrl = chord.ctrl || (chord.mod && !isMac)
  const wantMeta = chord.meta || (chord.mod && isMac)
  const hasSyntheticMeta = heldMeta && !event.metaKey && !isMetaKey(event)
  const hasAlt = hasSyntheticMeta ? false : event.altKey
  if (hasCtrl(event) !== wantCtrl) return false
  if (hasMeta(event) !== wantMeta) return false
  if (hasAlt !== chord.alt) return false
  if (event.shiftKey !== chord.shift) return false

  const key = event.key.toLowerCase()
  if (chord.key === key) return true
  if (chord.key === '\\' && (key === '¥' || key === '|')) return true
  return false
}

type Bindings = Partial<Record<KeybindingAction, KeyChord>>

let compiled: Bindings = {}

function compile(raw: Record<string, string>): Bindings {
  const out: Bindings = {}
  for (const [action, chord] of Object.entries(raw)) {
    const parsed = parseChord(chord)
    if (parsed) out[action as KeybindingAction] = parsed
  }
  return out
}

export async function loadKeybindings(): Promise<void> {
  try {
    const raw = await GetKeybindings()
    compiled = compile(raw ?? {})
  } catch {
    compiled = {}
  }
}

export function formatAction(action: KeybindingAction): string | null {
  const chord = compiled[action]
  if (!chord) return null
  const parts: string[] = []
  if (chord.mod) parts.push(isMac ? '⌘' : 'Ctrl')
  if (chord.meta) parts.push(isMac ? '⌘' : 'Win')
  if (chord.ctrl) parts.push('Ctrl')
  if (chord.alt) parts.push(isMac ? '⌥' : 'Alt')
  if (chord.shift) parts.push(isMac ? '⇧' : 'Shift')
  const key = /^f\d{1,2}$/.test(chord.key) || chord.key.length === 1 ? chord.key.toUpperCase() : chord.key
  parts.push(key)
  return parts.join(isMac ? '' : '+')
}

export function matchAction(event: KeyboardEvent): KeybindingAction | null {
  if (event.type === 'keydown') {
    if (isMetaKey(event)) heldMeta = true
    if (isCtrlKey(event)) heldCtrl = true
  }
  for (const [action, chord] of Object.entries(compiled)) {
    if (chord && chordMatchesEvent(chord, event)) return action as KeybindingAction
  }
  return null
}
