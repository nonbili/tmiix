import { observable } from '@legendapp/state'
import {
  DeleteRunbook,
  DeleteSnippet,
  ListRunbooks,
  SaveRunbook,
  SaveSnippet,
  WriteTab,
} from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'
import { getActiveTab, openLocalShell, openRemoteShell, tabs$ } from './tabs'
import { requestConfirm } from './ui'

export const snippets$ = observable({
  runbooks: [] as main.Runbook[],
  expanded: {} as Record<string, boolean>,
})

export async function refreshSnippets() {
  try {
    snippets$.runbooks.set(await ListRunbooks())
  } catch {
    /* ignore */
  }
}

export function toggleRunbook(name: string) {
  snippets$.expanded[name].set((expanded) => !expanded)
}

export async function runSnippet(snippet: main.Snippet) {
  const command = snippet.body.endsWith('\n') ? snippet.body : `${snippet.body}\n`

  if (snippet.target === 'new-tab') {
    const before = new Set(tabs$.items.peek().map((tab) => tab.id))
    if (snippet.server) {
      await openRemoteShell(snippet.server)
    } else {
      await openLocalShell()
    }
    const newTab = tabs$.items.peek().find((tab) => !before.has(tab.id))
    if (!newTab) return
    window.setTimeout(() => {
      void WriteTab(newTab.id, command)
    }, 500)
    return
  }

  const activeTab = getActiveTab()
  if (!activeTab) return
  await WriteTab(activeTab.id, command)
}

// --- Runbook/snippet dialogs -------------------------------------------------

export interface RunbookDialogState {
  open: boolean
  oldName: string | null // null when creating
  name: string
  target: 'current-tab' | 'new-tab'
  server: string
}

export interface SnippetEditorState {
  open: boolean
  runbook: string
  oldName: string | null // null when creating
  name: string
  target: '' | 'current-tab' | 'new-tab' // '' = inherit from runbook
  server: string
  body: string
}

export const runbookDialog$ = observable<RunbookDialogState>({
  open: false,
  oldName: null,
  name: '',
  target: 'current-tab',
  server: '',
})

// The snippet editor is a full-pane view (not a modal) so it can stay open
// while you run/tweak/re-run a snippet against a live tab.
export const snippetEditor$ = observable<SnippetEditorState>({
  open: false,
  runbook: '',
  oldName: null,
  name: '',
  target: '',
  server: '',
  body: '',
})

export function openCreateRunbookDialog() {
  runbookDialog$.set({ open: true, oldName: null, name: '', target: 'current-tab', server: '' })
}

export function openEditRunbookDialog(runbook: main.Runbook) {
  runbookDialog$.set({
    open: true,
    oldName: runbook.name,
    name: runbook.name,
    target: runbook.target === 'new-tab' ? 'new-tab' : 'current-tab',
    server: runbook.server ?? '',
  })
}

export function closeRunbookDialog() {
  runbookDialog$.open.set(false)
}

export async function saveRunbookDialog() {
  const state = runbookDialog$.peek()
  await SaveRunbook(state.oldName ?? '', state.name.trim(), state.target, state.server.trim())
  closeRunbookDialog()
  await refreshSnippets()
}

export async function deleteRunbook(name: string) {
  const confirmed = await requestConfirm({
    title: 'Delete runbook',
    message: `Delete runbook "${name}" and all its snippets? This cannot be undone.`,
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (!confirmed) return
  await DeleteRunbook(name)
  await refreshSnippets()
}

export function openCreateSnippetEditor(runbook: string) {
  snippetEditor$.set({ open: true, runbook, oldName: null, name: '', target: '', server: '', body: '' })
}

export function openEditSnippetEditor(snippet: main.Snippet) {
  snippetEditor$.set({
    open: true,
    runbook: snippet.runbook,
    oldName: snippet.name,
    name: snippet.name,
    target: (snippet.ownTarget as '' | 'current-tab' | 'new-tab') || '',
    server: snippet.ownServer ?? '',
    body: snippet.body,
  })
}

export function closeSnippetEditor() {
  snippetEditor$.open.set(false)
}

export async function saveSnippetEditor() {
  const state = snippetEditor$.peek()
  await SaveSnippet(
    state.runbook,
    state.oldName ?? '',
    state.name.trim(),
    state.body,
    state.target,
    state.server.trim(),
  )
  await refreshSnippets()
  // Keep editing (now as an edit of the just-saved snippet) rather than
  // closing, so Save + Run-to-test can be repeated in a loop.
  snippetEditor$.oldName.set(state.name.trim())
}

function getRunbookDefaults(runbookName: string): { target: 'current-tab' | 'new-tab'; server: string } {
  const runbook = snippets$.runbooks.peek().find((r) => r.name === runbookName)
  return { target: runbook?.target === 'new-tab' ? 'new-tab' : 'current-tab', server: runbook?.server ?? '' }
}

// Runs the snippet editor's current (possibly unsaved) draft, so you can
// tweak the body and re-run without saving first.
export async function runSnippetEditorDraft() {
  const state = snippetEditor$.peek()
  const defaults = getRunbookDefaults(state.runbook)
  const target = state.target || defaults.target
  const server = state.target === '' ? defaults.server : state.server.trim()
  await runSnippet(
    main.Snippet.createFrom({
      runbook: state.runbook,
      name: state.name.trim() || '(draft)',
      body: state.body,
      target,
      server,
    }),
  )
}

export async function deleteSnippet(snippet: { runbook: string; name: string }) {
  const confirmed = await requestConfirm({
    title: 'Delete snippet',
    message: `Delete snippet "${snippet.name}"? This cannot be undone.`,
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (!confirmed) return
  await DeleteSnippet(snippet.runbook, snippet.name)
  await refreshSnippets()
}
