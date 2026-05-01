import type { ITheme } from '@xterm/xterm'

export type TerminalTheme = {
  id: string
  name: string
  theme: ITheme
}

export const DEFAULT_THEME_ID = 'github-dark'

const FALLBACK_THEME: TerminalTheme = {
  id: DEFAULT_THEME_ID,
  name: 'GitHub Dark',
  theme: {
    background: '#0d1117',
    foreground: '#c9d1d9',
    cursor: '#58a6ff',
    cursorAccent: '#0d1117',
    selectionBackground: '#264f78',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc',
  },
}

// Mutable so loadInitialThemes can swap in the backend-loaded list before
// React renders. ESM live bindings keep importers in sync.
export let TERMINAL_THEMES: TerminalTheme[] = [FALLBACK_THEME]

export function setTerminalThemes(themes: TerminalTheme[]) {
  TERMINAL_THEMES = themes.length > 0 ? themes : [FALLBACK_THEME]
}

export function getTheme(id: string): TerminalTheme {
  return TERMINAL_THEMES.find((t) => t.id === id) ?? TERMINAL_THEMES[0]
}
