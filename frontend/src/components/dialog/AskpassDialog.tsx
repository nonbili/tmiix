import { useValue } from '@legendapp/state/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff, X } from 'lucide-react'
import { CancelPassphrase, SubmitPassphrase } from '../../../wailsjs/go/main/App'
import { EventsOn } from '../../../wailsjs/runtime/runtime'
import { closeAskpassPrompt, setAskpassError, setAskpassSubmitting, showAskpassPrompt, ui$ } from '../../state/ui'

function parsePrompt(prompt: string) {
  const match = prompt.match(/Enter passphrase for key '([^']+)'/i)
  const keyPath = match?.[1] ?? ''
  return { keyPath, line: prompt.trim().replace(/:\s*$/, ':') }
}

export function AskpassDialog() {
  const askpass = useValue(ui$.askpass)
  const [passphrase, setPassphrase] = useState('')
  const [reveal, setReveal] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const parsed = useMemo(() => parsePrompt(askpass.prompt), [askpass.prompt])

  useEffect(() => {
    const offPrompt = EventsOn('ssh:passphrase', (payload: { id?: string; prompt?: string }) => {
      showAskpassPrompt(payload?.id ?? '', payload?.prompt ?? 'SSH passphrase required')
    })
    return () => offPrompt()
  }, [])

  useEffect(() => {
    if (!askpass.open) {
      setPassphrase('')
      setReveal(false)
      return
    }
    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }, [askpass.open, askpass.id])

  useEffect(() => {
    if (!askpass.open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !askpass.submitting) {
        event.preventDefault()
        void handleCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [askpass.open, askpass.submitting, askpass.id])

  const handleCancel = async () => {
    const id = ui$.askpass.id.peek()
    if (!id) {
      closeAskpassPrompt()
      return
    }
    try {
      await CancelPassphrase(id)
    } finally {
      closeAskpassPrompt()
    }
  }

  const handleSubmit = async () => {
    const id = ui$.askpass.id.peek()
    if (!id || askpass.submitting) return
    setAskpassSubmitting(true)
    setAskpassError('')
    try {
      await SubmitPassphrase(id, passphrase)
      closeAskpassPrompt()
    } catch {
      setAskpassSubmitting(false)
      setAskpassError('Passphrase was rejected. Try again.')
      setPassphrase('')
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  if (!askpass.open) return null

  return (
    <div className="fixed top-3 left-0 right-0 grid place-items-center z-30 pointer-events-none">
      <div
        className="pointer-events-auto w-[min(480px,calc(100vw-32px))] bg-surface border border-border rounded-lg shadow-[0_12px_40px_rgba(0,0,0,0.45)] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
          <div className="flex items-center gap-2 px-3 pt-2 pb-1">
            <span className="font-mono text-[13px] text-foreground-muted truncate">{parsed.line}</span>
          </div>
          <div className="flex items-center gap-2 px-3 pb-2 border-b border-border">
            <input
              ref={inputRef}
              type={reveal ? 'text' : 'password'}
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !askpass.submitting) {
                  event.preventDefault()
                  void handleCancel()
                }
              }}
              className="flex-1 bg-transparent border-none outline-none font-mono text-[13px] text-foreground-strong"
              autoComplete="off"
              spellCheck={false}
              disabled={askpass.submitting}
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="text-foreground-subtle hover:text-foreground-strong px-1 grid place-items-center"
              title={reveal ? 'Hide' : 'Show'}
              tabIndex={-1}
            >
              {reveal ? <EyeOff size={14} strokeWidth={1.7} /> : <Eye size={14} strokeWidth={1.7} />}
            </button>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 text-xs text-foreground-subtle">
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={askpass.submitting}
              className="flex items-center gap-1.5 hover:text-foreground-strong disabled:opacity-50"
            >
              <X size={14} strokeWidth={1.8} />
              Cancel
            </button>
            <span className="font-mono">
              {askpass.error ? (
                <span className="text-term-red">{askpass.error}</span>
              ) : (
                'enter to submit · esc to cancel'
              )}
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}
