import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ListThemes, ListUIThemes } from '../wailsjs/go/main/App'
import { setTerminalThemes, type TerminalTheme } from './themes'
import { applyUITheme, setUIThemes, type UITheme } from './uiThemes'
import { readStoredUIThemeId } from './lib/storage'
import { loadKeybindings } from './lib/keybindings'
import '@xterm/xterm/css/xterm.css'
import './style.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element not found')
}

function refreshRuntimeConfig() {
  void Promise.all([
    ListThemes()
      .then((themes) => setTerminalThemes(themes as unknown as TerminalTheme[]))
      .catch(() => {
        /* fall back to the embedded default in themes.ts */
      }),
    ListUIThemes()
      .then((themes) => {
        setUIThemes(themes as unknown as UITheme[])
        applyUITheme(readStoredUIThemeId())
      })
      .catch(() => {
        /* fall back to the embedded defaults in uiThemes.ts */
      }),
    loadKeybindings(),
  ])
}

function bootstrap() {
  applyUITheme(readStoredUIThemeId())

  createRoot(container!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )

  refreshRuntimeConfig()
}

bootstrap()
