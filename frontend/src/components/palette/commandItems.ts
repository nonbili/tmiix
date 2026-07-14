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
    id: 'open-tmux-here',
    label: 'Open tmux session here',
    detail: 'Start or attach tmux in this shell using the current directory name',
    aliases: ['tmux', 'session', 'here', 'current directory', 'cwd', 'remote'],
  },
  {
    id: 'close-tab',
    label: 'Close tab',
    detail: 'Close the active tab',
    aliases: ['close', 'tab'],
    shortcut: 'tab.close',
  },
  {
    id: 'upload-files',
    label: 'Upload Files…',
    detail: 'Pick files to upload to the active tab',
    aliases: ['upload', 'files', 'send', 'transfer', 'scp'],
  },
  {
    id: 'kill-session',
    label: 'Kill session',
    detail: "Terminate the active tab's tmux session",
    aliases: ['kill', 'session', 'terminate', 'tmux', 'active'],
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
    id: 'run-snippet',
    label: 'Run snippet',
    detail: 'Search runbooks and run a saved snippet',
    aliases: ['snippet', 'runbook', 'run', 'command'],
  },
  {
    id: 'open-snippets-folder',
    label: 'Open snippets folder',
    detail: 'Reveal the runbooks/snippets directory',
    aliases: ['snippet', 'runbook', 'folder', 'open'],
  },
  {
    id: 'reload-settings',
    label: 'Reload settings',
    detail: 'Re-read settings.toml, the themes folder, and snippets',
    aliases: ['reload', 'settings', 'refresh', 'themes', 'keybindings', 'snippets'],
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

  const rank = (item: T): number | null => {
    const label = item.label.toLowerCase()
    const detail = item.detail.toLowerCase()
    const aliases = item.aliases.map((alias) => alias.toLowerCase())

    if (label === normalized) return 0
    if (aliases.includes(normalized)) return 1
    if (label.startsWith(normalized)) return 2
    if (aliases.some((alias) => alias.startsWith(normalized))) return 3
    if (label.includes(normalized)) return 4
    if (aliases.some((alias) => alias.includes(normalized))) return 5
    if (detail.includes(normalized)) return 6
    return null
  }

  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .filter((entry): entry is typeof entry & { rank: number } => entry.rank !== null)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ item }) => item)
}
