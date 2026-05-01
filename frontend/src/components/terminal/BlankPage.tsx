import { ArrowLeftRight, Maximize, Menu, PanelLeft, Plus } from 'lucide-react'
import { formatAction, type KeybindingAction } from '../../lib/keybindings'
import { openPalette, openCommandPalette, toggleSidebar } from '../../state/ui'
import { WindowFullscreen, WindowIsFullscreen, WindowUnfullscreen } from '../../../wailsjs/runtime/runtime'

const HELP_ITEMS: { action: KeybindingAction; label: string; icon: React.ReactNode; run: () => void }[] = [
  { action: 'palette.new', label: 'New session', icon: <Plus size={14} strokeWidth={1.8} />, run: () => openPalette('new') },
  {
    action: 'palette.switch',
    label: 'Switch session',
    icon: <ArrowLeftRight size={14} strokeWidth={1.7} />,
    run: () => openPalette('switch'),
  },
  {
    action: 'palette.command',
    label: 'Command palette',
    icon: <Menu size={14} strokeWidth={1.8} />,
    run: () => openCommandPalette(),
  },
  {
    action: 'sidebar.toggle',
    label: 'Toggle sidebar',
    icon: <PanelLeft size={14} strokeWidth={1.7} />,
    run: () => toggleSidebar(),
  },
  {
    action: 'window.fullscreen',
    label: 'Toggle fullscreen',
    icon: <Maximize size={14} strokeWidth={1.8} />,
    run: () => {
      void WindowIsFullscreen().then((isFs) => (isFs ? WindowUnfullscreen() : WindowFullscreen()))
    },
  },
]

export function BlankPage() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center select-none overflow-hidden bg-background">
      {/* Background Subtle Logo */}
      <div className="absolute -bottom-16 -right-16 opacity-[0.02] rotate-12 scale-150 pointer-events-none select-none">
        <div className="text-[40rem] font-mono font-bold leading-none">t</div>
      </div>

      <div className="flex flex-col items-center">
        <div className="text-8xl font-mono font-bold flex items-baseline gap-[0.05em] pointer-events-none">
          <span className="text-foreground drop-shadow-[0_0_15px_rgba(201,209,217,0.2)] tracking-tighter">tm</span>
          <span className="font-sans text-term-green drop-shadow-[0_0_15px_rgba(63,185,80,0.3)]">i</span>
          <span className="font-sans text-term-green drop-shadow-[0_0_15px_rgba(63,185,80,0.3)]">i</span>
          <span className="text-foreground drop-shadow-[0_0_15px_rgba(201,209,217,0.2)]">x</span>
        </div>

        <div className="mt-4 text-foreground-subtle text-[11px] font-bold uppercase tracking-[0.4em] translate-x-[0.2em] pointer-events-none">
          Tmux Multiplexer
        </div>

        <div className="mt-16 w-full min-w-[320px] space-y-6">
          <div className="flex items-center gap-4 pointer-events-none">
            <div className="h-px flex-1 bg-border/40"></div>
            <div className="text-[10px] font-bold text-foreground-subtle uppercase tracking-[0.2em]">Quick Start</div>
            <div className="h-px flex-1 bg-border/40"></div>
          </div>

          <div className="grid grid-cols-1 gap-1">
            {HELP_ITEMS.map(({ action, label, icon, run }) => {
              const chord = formatAction(action)
              if (!chord) return null
              return (
                <button
                  key={action}
                  onClick={run}
                  className="flex items-center justify-between group px-4 py-2 rounded-xl transition-all hover:bg-surface active:scale-[0.98] cursor-pointer border border-transparent hover:border-border/30"
                >
                  <div className="flex items-center gap-3 text-foreground-muted group-hover:text-foreground transition-colors">
                    <span className="opacity-40 group-hover:opacity-100 transition-opacity">{icon}</span>
                    <span className="text-[13px]">{label}</span>
                  </div>
                  <kbd className="px-1.5 py-0.5 rounded border border-border bg-elevated text-foreground-muted font-mono text-[10px] min-w-[3.5rem] text-center shadow-sm group-hover:text-foreground transition-colors">
                    {chord}
                  </kbd>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
