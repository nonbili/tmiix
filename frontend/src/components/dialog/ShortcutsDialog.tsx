import { useEffect } from 'react'
import { useValue } from '@legendapp/state/react'
import { X } from 'lucide-react'
import { closeShortcuts, ui$ } from '../../state/ui'
import { formatAction, KeybindingAction } from '../../lib/keybindings'

type ShortcutGroup = {
  title: string
  items: Array<{ action: KeybindingAction; label: string }>
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Palettes',
    items: [
      { action: 'palette.switch', label: 'Switch session' },
      { action: 'palette.new', label: 'New session' },
      { action: 'palette.command', label: 'Command palette' },
    ],
  },
  {
    title: 'Tabs',
    items: [
      { action: 'tab.close', label: 'Close active tab' },
      { action: 'tab.cycle.next', label: 'Next tab' },
      { action: 'tab.cycle.prev', label: 'Previous tab' },
      { action: 'tab.select.1', label: 'Jump to tab 1–9' },
    ],
  },
  {
    title: 'Window',
    items: [
      { action: 'sidebar.toggle', label: 'Toggle sidebar' },
      { action: 'window.fullscreen', label: 'Toggle fullscreen' },
    ],
  },
  {
    title: 'Terminal',
    items: [{ action: 'terminal.paste', label: 'Paste clipboard' }],
  },
]

function Kbd({ chord }: { chord: string | null }) {
  if (!chord) return <span className="text-foreground-subtle text-xs italic">unbound</span>
  return (
    <kbd className="inline-flex items-center px-1.5 h-5 rounded border border-border bg-elevated text-[11px] font-mono text-foreground-strong">
      {chord}
    </kbd>
  )
}

export function ShortcutsDialog() {
  const open = useValue(ui$.shortcutsOpen)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeShortcuts()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 grid place-items-center z-50 bg-overlay backdrop-blur-sm px-4">
      <div
        className="relative w-full max-w-[520px] max-h-[80vh] overflow-auto bg-surface border border-border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <button
          onClick={closeShortcuts}
          className="absolute top-3 right-3 p-1.5 text-foreground-subtle hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          aria-label="Close"
        >
          <X size={14} strokeWidth={1.8} />
        </button>

        <div className="px-6 pt-6 pb-2">
          <h2 className="text-base font-semibold text-foreground-strong">Keyboard shortcuts</h2>
          <p className="text-xs text-foreground-subtle mt-1">
            Customize bindings in <span className="font-mono">~/.config/tmiix/settings.toml</span>.
          </p>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-[11px] uppercase tracking-[0.08em] text-foreground-subtle mb-1.5">
                {group.title}
              </h3>
              <div className="rounded-lg border border-border divide-y divide-border/60">
                {group.items.map((item) => (
                  <div
                    key={item.action}
                    className="flex items-center justify-between gap-4 px-3 py-2 text-sm text-foreground"
                  >
                    <span>{item.label}</span>
                    <Kbd chord={formatAction(item.action)} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
