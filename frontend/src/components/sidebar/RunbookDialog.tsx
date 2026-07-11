import { useValue } from '@legendapp/state/react'
import { useEffect, useRef, useState } from 'react'
import { getKnownServers } from '../../state/servers'
import { closeRunbookDialog, runbookDialog$, saveRunbookDialog } from '../../state/snippets'

export function RunbookDialog() {
  const state = useValue(runbookDialog$)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const nameRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!state.open) return
    setError(null)
    setSubmitting(false)
    window.setTimeout(() => nameRef.current?.focus(), 0)
  }, [state.open])

  if (!state.open) return null

  const isEdit = state.oldName !== null
  const knownServers = getKnownServers()

  const submit = async () => {
    if (submitting) return
    if (!state.name.trim()) {
      setError('Name is required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await saveRunbookDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 grid place-items-center z-50 bg-overlay backdrop-blur-sm px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRunbookDialog()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') closeRunbookDialog()
      }}
    >
      <div
        className="relative w-full max-w-[380px] bg-surface border border-border/90 rounded-[8px] shadow-[0_20px_50px_rgba(0,0,0,0.42)] overflow-hidden animate-in fade-in zoom-in duration-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-5">
          <h2 className="text-base font-semibold text-foreground-strong mb-4">
            {isEdit ? 'Edit runbook' : 'New runbook'}
          </h2>

          <label className="block text-[11px] text-foreground-subtle mb-1">Name</label>
          <input
            ref={nameRef}
            className="w-full mb-3 bg-elevated border border-border rounded-[6px] px-2.5 py-1.5 text-sm text-foreground-strong outline-0 focus:border-accent-muted"
            value={state.name}
            onChange={(event) => runbookDialog$.name.set(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
            }}
            placeholder="deploy"
          />

          <label className="block text-[11px] text-foreground-subtle mb-1">Default target</label>
          <select
            className="w-full mb-3 bg-elevated border border-border rounded-[6px] px-2.5 py-1.5 text-sm text-foreground-strong outline-0 focus:border-accent-muted"
            value={state.target}
            onChange={(event) => runbookDialog$.target.set(event.target.value as 'current-tab' | 'new-tab')}
          >
            <option value="current-tab">Current tab</option>
            <option value="new-tab">New tab</option>
          </select>

          {state.target === 'new-tab' ? (
            <>
              <label className="block text-[11px] text-foreground-subtle mb-1">Server</label>
              <select
                className="w-full mb-1 bg-elevated border border-border rounded-[6px] px-2.5 py-1.5 text-sm text-foreground-strong outline-0 focus:border-accent-muted"
                value={state.server}
                onChange={(event) => runbookDialog$.server.set(event.target.value)}
              >
                <option value="">Local</option>
                {knownServers.map((server) => (
                  <option key={server.name} value={server.name}>
                    {server.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          {error ? <div className="mt-2 text-term-red text-xs">{error}</div> : null}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              onClick={closeRunbookDialog}
              className="py-2 px-4 bg-elevated hover:bg-muted border border-border rounded-[6px] text-sm text-foreground hover:text-foreground-strong transition-colors"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={() => void submit()}
              className="py-2 px-4 rounded-[6px] text-sm font-medium bg-accent hover:bg-accent/90 text-background border border-transparent transition-colors"
              type="button"
            >
              {isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
