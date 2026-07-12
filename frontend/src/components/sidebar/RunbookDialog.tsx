import { useValue } from '@legendapp/state/react'
import { useEffect, useRef, useState } from 'react'
import { getKnownServers } from '../../state/servers'
import { closeRunbookDialog, runbookDialog$, saveRunbookDialog } from '../../state/snippets'
import { Button } from '../button/Button'
import { FieldLabel, Select, TextInput } from '../form/Field'

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

          <FieldLabel>Name</FieldLabel>
          <TextInput
            ref={nameRef}
            className="mb-3"
            value={state.name}
            onChange={(event) => runbookDialog$.name.set(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
            }}
            placeholder="deploy"
          />

          <FieldLabel>Tab</FieldLabel>
          <Select
            className="mb-3"
            value={state.tab}
            onChange={(event) => runbookDialog$.tab.set(event.target.value as 'current-tab' | 'new-tab')}
          >
            <option value="current-tab">Current tab</option>
            <option value="new-tab">New tab</option>
          </Select>

          {state.tab === 'new-tab' ? (
            <>
              <FieldLabel>Target</FieldLabel>
              <Select
                className="mb-1"
                value={state.target}
                onChange={(event) => runbookDialog$.target.set(event.target.value)}
              >
                <option value="">Local</option>
                {knownServers.map((server) => (
                  <option key={server.name} value={server.name}>
                    {server.name}
                  </option>
                ))}
              </Select>
            </>
          ) : null}

          {error ? <div className="mt-2 text-term-red text-xs">{error}</div> : null}

          <div className="mt-5 flex items-center justify-end gap-3">
            <Button onClick={closeRunbookDialog}>Cancel</Button>
            <Button variant="primary" onClick={() => void submit()}>
              {isEdit ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
