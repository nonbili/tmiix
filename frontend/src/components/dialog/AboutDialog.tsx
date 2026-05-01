import { useValue } from '@legendapp/state/react'
import { ExternalLink, X } from 'lucide-react'
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime'
import { closeAbout, ui$ } from '../../state/ui'
import { useEffect, useState } from 'react'
import logo from '../../assets/logo.png'
import { GetAppInfo } from '../../../wailsjs/go/main/App'
import { main } from '../../../wailsjs/go/models'

export function AboutDialog() {
  const open = useValue(ui$.aboutOpen)
  const [appInfo, setAppInfo] = useState<main.AppInfo | null>(null)

  useEffect(() => {
    if (!open) return
    void GetAppInfo()
      .then(setAppInfo)
      .catch(() => setAppInfo(null))

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeAbout()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 grid place-items-center z-50 bg-overlay backdrop-blur-sm px-4">
      <div
        className="relative w-full max-w-[400px] bg-surface border border-border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in duration-200"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={closeAbout}
          className="absolute top-3 right-3 p-1.5 text-foreground-subtle hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          aria-label="Close"
        >
          <X size={14} strokeWidth={1.8} />
        </button>

        <div className="p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 mb-6">
            <img src={logo} alt="Tmiix Logo" className="w-full h-full object-contain" />
          </div>

          <h2 className="text-xl font-bold text-foreground-strong mb-1">Tmiix</h2>
          <p className="text-xs text-foreground-subtle mb-2">{appInfo?.version ?? 'v0.1.0'}</p>
          <p className="text-sm text-foreground-subtle mb-6">A modern tmux session manager</p>

          <div className="w-full space-y-3">
            <button
              onClick={() => BrowserOpenURL('https://github.com/nonbili/tmiix')}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-elevated hover:bg-muted border border-border rounded-lg text-sm text-foreground hover:text-foreground-strong transition-all group"
            >
              GitHub Repository
              <span className="text-foreground-subtle group-hover:text-foreground transition-colors">
                <ExternalLink size={12} strokeWidth={1.8} />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
