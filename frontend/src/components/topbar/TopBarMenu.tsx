import { useEffect, useRef, useState } from 'react'
import { FileSliders, Info, Keyboard, Menu, Palette, Plus, Power, RefreshCw } from 'lucide-react'
import { Quit } from '../../../wailsjs/runtime/runtime'
import { OpenSettingsFile } from '../../../wailsjs/go/main/App'
import { openAbout, openCommandPalette, openRemotePalette, openShortcuts } from '../../state/ui'
import { showToast } from '../../state/toasts'
import { reloadSettings } from '../../lib/reloadSettings'
import { IconButton } from '../button/IconButton'

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
}

function MenuItem({ icon, label, onClick }: MenuItemProps) {
  return (
    <button
      className="w-full flex items-center gap-2.5 text-left text-[12px] normal-case tracking-normal text-foreground hover:text-foreground-strong hover:bg-muted bg-transparent border-0 cursor-pointer rounded-md px-2.5 py-1.5 transition-colors group"
      onClick={onClick}
      type="button"
    >
      <span className="text-foreground-subtle group-hover:text-foreground">{icon}</span>
      {label}
    </button>
  )
}

export function TopBarMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('contextmenu', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('contextmenu', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={ref} className="relative shrink-0">
      <IconButton
        icon={<Menu size={14} strokeWidth={1.8} />}
        title="App menu"
        aria-label="App menu"
        aria-expanded={open}
        className="w-6 h-6 text-foreground-muted hover:text-foreground-strong hover:bg-muted border border-transparent hover:border-border rounded-[3px]"
        onClick={() => setOpen((v) => !v)}
      />
      {open ? (
        <div className="absolute top-[calc(100%+6px)] right-0 z-40 min-w-[200px] rounded-lg border border-border bg-elevated p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] animate-in slide-in-from-top-2 duration-150">
          <MenuItem
            icon={<Palette size={13} strokeWidth={1.7} />}
            label="Terminal theme"
            onClick={() => {
              close()
              openCommandPalette('theme')
            }}
          />
          <MenuItem
            icon={<Palette size={13} strokeWidth={1.7} />}
            label="UI theme"
            onClick={() => {
              close()
              openCommandPalette('ui-theme')
            }}
          />
          <MenuItem
            icon={<Plus size={13} strokeWidth={1.8} />}
            label="Connect to server"
            onClick={() => {
              close()
              openRemotePalette(false)
            }}
          />
          <div className="my-1 border-t border-border/50" />
          <MenuItem
            icon={<Keyboard size={13} strokeWidth={1.7} />}
            label="Keyboard shortcuts"
            onClick={() => {
              close()
              openShortcuts()
            }}
          />
          <MenuItem
            icon={<FileSliders size={13} strokeWidth={1.8} />}
            label="Open settings file"
            onClick={() => {
              close()
              OpenSettingsFile().catch((err) => {
                const message = err instanceof Error ? err.message : String(err)
                showToast('error', `Failed to open settings: ${message}`)
              })
            }}
          />
          <MenuItem
            icon={<RefreshCw size={13} strokeWidth={1.8} />}
            label="Reload settings"
            onClick={() => {
              close()
              reloadSettings()
                .then(() => showToast('success', 'Settings reloaded'))
                .catch((err) => {
                  const message = err instanceof Error ? err.message : String(err)
                  showToast('error', `Failed to reload settings: ${message}`)
                })
            }}
          />
          <MenuItem
            icon={<Info size={13} strokeWidth={1.7} />}
            label="About"
            onClick={() => {
              close()
              openAbout()
            }}
          />
          <div className="my-1 border-t border-border/50" />
          <MenuItem
            icon={<Power size={13} strokeWidth={1.7} />}
            label="Quit"
            onClick={() => {
              close()
              Quit()
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
