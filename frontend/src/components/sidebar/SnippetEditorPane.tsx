import { useValue } from '@legendapp/state/react'
import { ArrowLeft, Play } from 'lucide-react'
import { useState } from 'react'
import { getKnownServers } from '../../state/servers'
import {
  closeSnippetEditor,
  deleteSnippet,
  runSnippetEditorDraft,
  saveSnippetEditor,
  snippetEditor$,
} from '../../state/snippets'
import { CodeTextarea } from '../CodeTextarea'
import { Button } from '../button/Button'
import { IconButton } from '../button/IconButton'
import { FieldLabel, Select, TextInput } from '../form/Field'

export function SnippetEditorPane() {
  const state = useValue(snippetEditor$)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)

  const isEdit = state.oldName !== null
  const knownServers = getKnownServers()

  const save = async () => {
    if (saving) return
    if (!state.name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveSnippetEditor()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const run = async () => {
    if (running) return
    setRunning(true)
    setError(null)
    try {
      await runSnippetEditorDraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const remove = async () => {
    if (state.oldName === null) return
    await deleteSnippet({ runbook: state.runbook, name: state.oldName })
    closeSnippetEditor()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 h-8 pl-1.5 pr-2 border-b border-border/80 bg-elevated/40 shrink-0">
        <IconButton
          icon={<ArrowLeft size={14} strokeWidth={1.8} />}
          title="Back"
          size={24}
          className="text-foreground-subtle hover:text-foreground"
          onClick={closeSnippetEditor}
        />
        <span className="text-[11px] text-foreground-subtle">
          {isEdit ? 'Edit snippet' : 'New snippet'} — {state.runbook}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <FieldLabel>Name</FieldLabel>
        <TextInput
          className="mb-3"
          value={state.name}
          onChange={(event) => snippetEditor$.name.set(event.target.value)}
          placeholder="restart-api"
        />

        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <FieldLabel>Tab</FieldLabel>
            <Select
              value={state.tab}
              onChange={(event) =>
                snippetEditor$.tab.set(event.target.value as '' | 'current-tab' | 'new-tab')
              }
            >
              <option value="">Inherit</option>
              <option value="current-tab">Current tab</option>
              <option value="new-tab">New tab</option>
            </Select>
          </div>
          {state.tab === 'new-tab' ? (
            <div className="flex-1">
              <FieldLabel>Target</FieldLabel>
              <Select
                value={state.target}
                onChange={(event) => snippetEditor$.target.set(event.target.value)}
              >
                <option value="">Local</option>
                {knownServers.map((server) => (
                  <option key={server.name} value={server.name}>
                    {server.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-foreground-subtle">Body</label>
          <button
            onClick={() => void run()}
            className="py-1 px-2.5 flex items-center gap-1.5 rounded-[6px] text-xs text-foreground hover:bg-elevated border border-border transition-colors"
            type="button"
            disabled={running}
          >
            <Play size={12} strokeWidth={1.8} />
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
        <CodeTextarea
          value={state.body}
          onChange={(value) => snippetEditor$.body.set(value)}
          placeholder="echo hello"
          rows={14}
        />

        {error ? <div className="mt-2 text-term-red text-xs">{error}</div> : null}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-border shrink-0">
        {isEdit ? (
          <Button variant="danger" onClick={() => void remove()}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
