export type UITheme = {
  id: string
  name: string
  colorScheme: 'light' | 'dark'
  colors: Record<string, string>
}

export const SYSTEM_UI_THEME_ID = 'system'
export const DEFAULT_DARK_UI_THEME_ID = 'dark'
export const DEFAULT_LIGHT_UI_THEME_ID = 'light'

const FALLBACK_DARK: UITheme = {
  id: DEFAULT_DARK_UI_THEME_ID,
  name: 'Dark',
  colorScheme: 'dark',
  colors: {
    background: '#0d1117',
    surface: '#161b22',
    elevated: '#1c2128',
    muted: '#22272e',
    foreground: '#c9d1d9',
    'foreground-strong': '#e6edf3',
    'foreground-muted': '#8b949e',
    'foreground-subtle': '#6e7681',
    border: '#30363d',
    'border-strong': '#444c56',
    accent: '#58a6ff',
    'accent-muted': '#1f6feb',
    'accent-soft': 'rgba(88,166,255,0.12)',
    overlay: 'rgba(6,9,14,0.55)',
    'term-green': '#3fb950',
    'term-yellow': '#d29922',
    'term-red': '#f85149',
  },
}

const FALLBACK_LIGHT: UITheme = {
  id: DEFAULT_LIGHT_UI_THEME_ID,
  name: 'Light',
  colorScheme: 'light',
  colors: {
    background: '#ffffff',
    surface: '#f6f8fa',
    elevated: '#eaeef2',
    muted: '#d8dee4',
    foreground: '#24292f',
    'foreground-strong': '#1f2328',
    'foreground-muted': '#57606a',
    'foreground-subtle': '#8c959f',
    border: '#d0d7de',
    'border-strong': '#afb8c1',
    accent: '#0969da',
    'accent-muted': '#218bff',
    'accent-soft': 'rgba(9,105,218,0.10)',
    overlay: 'rgba(140,150,160,0.40)',
    'term-green': '#1a7f37',
    'term-yellow': '#9a6700',
    'term-red': '#cf222e',
  },
}

// Mutable so the bootstrap can swap in the backend-loaded list before render.
export let UI_THEMES: UITheme[] = [FALLBACK_DARK, FALLBACK_LIGHT]

export function setUIThemes(themes: UITheme[]) {
  UI_THEMES = themes.length > 0 ? themes : [FALLBACK_DARK, FALLBACK_LIGHT]
}

function prefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return true
  }
}

// resolveUITheme picks the concrete theme to render for a stored id.
// "system" follows the OS preference; an unknown id falls back to dark.
export function resolveUITheme(id: string): UITheme {
  if (id === SYSTEM_UI_THEME_ID) {
    const targetId = prefersDark() ? DEFAULT_DARK_UI_THEME_ID : DEFAULT_LIGHT_UI_THEME_ID
    return UI_THEMES.find((t) => t.id === targetId) ?? UI_THEMES[0]
  }
  return UI_THEMES.find((t) => t.id === id) ?? UI_THEMES[0]
}

export function applyUITheme(id: string) {
  const theme = resolveUITheme(id)
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--color-${key}`, value)
  }
  root.style.setProperty('color-scheme', theme.colorScheme)
  root.dataset.uiTheme = theme.id
}

// watchSystemUITheme re-applies the resolved theme whenever the OS
// preference changes, but only while the active selection is "system".
export function watchSystemUITheme(getCurrentId: () => string): () => void {
  let media: MediaQueryList
  try {
    media = window.matchMedia('(prefers-color-scheme: dark)')
  } catch {
    return () => {}
  }
  const onChange = () => {
    if (getCurrentId() === SYSTEM_UI_THEME_ID) applyUITheme(SYSTEM_UI_THEME_ID)
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
