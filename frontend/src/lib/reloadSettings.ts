import { ListThemes, ListUIThemes } from '../../wailsjs/go/main/App'
import { setTerminalThemes, type TerminalTheme } from '../themes'
import { setUIThemes, type UITheme } from '../uiThemes'
import { loadKeybindings } from './keybindings'

export async function reloadSettings() {
  await Promise.all([
    loadKeybindings(),
    ListThemes()
      .then((themes) => setTerminalThemes(themes as unknown as TerminalTheme[]))
      .catch(() => {}),
    ListUIThemes()
      .then((themes) => setUIThemes(themes as unknown as UITheme[]))
      .catch(() => {}),
  ])
}
