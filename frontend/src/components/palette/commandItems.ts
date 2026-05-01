import type { KeybindingAction } from '../../lib/keybindings'

export type CommandItemSpec = {
  id: string
  label: string
  detail: string
  aliases: string[]
  shortcut?: KeybindingAction
}

export const ROOT_COMMAND_ITEMS: CommandItemSpec[] = [
  {
    id: 'new-tab',
    label: 'New tab',
    detail: 'Open a new session',
    aliases: ['new', 'tab', 'session', 'open'],
    shortcut: 'palette.new',
  },
  {
    id: 'switch-session',
    label: 'Switch session',
    detail: 'Jump to another session',
    aliases: ['switch', 'session', 'find', 'jump'],
    shortcut: 'palette.switch',
  },
  {
    id: 'close-tab',
    label: 'Close tab',
    detail: 'Close the active tab',
    aliases: ['close', 'tab', 'kill'],
    shortcut: 'tab.close',
  },
  {
    id: 'toggle-sidebar',
    label: 'Toggle sidebar',
    detail: 'Show or hide the sidebar',
    aliases: ['sidebar', 'panel', 'toggle'],
    shortcut: 'sidebar.toggle',
  },
  {
    id: 'toggle-fullscreen',
    label: 'Toggle fullscreen',
    detail: 'Enter or leave fullscreen mode',
    aliases: ['fullscreen', 'window', 'maximize'],
    shortcut: 'window.fullscreen',
  },
  {
    id: 'change-theme',
    label: 'Change theme',
    detail: 'Choose the terminal color theme',
    aliases: ['theme', 'appearance', 'colors'],
  },
  {
    id: 'change-ui-theme',
    label: 'Change UI theme',
    detail: 'Choose the window/sidebar appearance (light/dark/system)',
    aliases: ['ui', 'theme', 'light', 'dark', 'system', 'appearance'],
  },
  {
    id: 'connect-new-server',
    label: 'Connect to new server',
    detail: 'Open the SSH connect flow',
    aliases: ['server', 'ssh', 'remote', 'host'],
  },
  {
    id: 'reload-settings',
    label: 'Reload settings',
    detail: 'Re-read settings.toml and the themes folder',
    aliases: ['reload', 'settings', 'refresh', 'themes', 'keybindings'],
  },
  {
    id: 'about',
    label: 'About tmiix',
    detail: 'Show app info',
    aliases: ['about', 'version', 'info'],
  },
  {
    id: 'quit-app',
    label: 'Quit tmiix',
    detail: 'Exit the application',
    aliases: ['quit', 'exit', 'close app'],
  },
]

export function filterCommandItems<T extends { label: string; detail: string; aliases: string[] }>(
  items: T[],
  query: string,
): T[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return items
  return items.filter((item) =>
    [item.label, item.detail, ...item.aliases].some((value) => value.toLowerCase().includes(normalized)),
  )
}
