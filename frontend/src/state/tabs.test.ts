import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { DetectTabSession, WriteTab } from '../../wailsjs/go/main/App'
import {
  canOpenTmuxHere,
  getTabs,
  openLocalShell,
  openTmuxHere,
  tabs$,
  updateTabLabel,
} from './tabs'

const detectTabSession = DetectTabSession as unknown as ReturnType<typeof import('bun:test').mock>
const writeTab = WriteTab as unknown as ReturnType<typeof import('bun:test').mock>

async function createLocalShellTab() {
  await openLocalShell()
  const tab = getTabs().at(-1)
  if (!tab) throw new Error('expected a tab to be created')
  return tab
}

// Drain pending microtasks and the (mocked, zero-delay) macrotask timers used
// by tabs.ts's retry loop and openTmuxHere's post-write check.
async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

beforeEach(() => {
  tabs$.items.set([])
  tabs$.activeTabId.set(null)
  detectTabSession.mockReset()
  detectTabSession.mockImplementation(async () => '')
  writeTab.mockReset()
  writeTab.mockImplementation(async () => {})
})

afterEach(() => {
  tabs$.items.set([])
  tabs$.activeTabId.set(null)
})

describe('updateTabLabel session detection', () => {
  it('promotes a local shell tab to a session tab when a tmux client is detected', async () => {
    const tab = await createLocalShellTab()
    detectTabSession.mockImplementation(async (tabId: string) => (tabId === tab.id ? 'mx' : ''))

    updateTabLabel(tab.id, 'mx')
    await flush()

    const updated = getTabs().find((t) => t.id === tab.id)
    expect(updated?.kind).toBe('session')
    expect(updated?.sessionName).toBe('mx')
  })

  it('leaves the tab as a shell when no tmux session is attached', async () => {
    const tab = await createLocalShellTab()
    detectTabSession.mockImplementation(async () => '')

    updateTabLabel(tab.id, 'just-a-directory-name')
    await flush()

    const updated = getTabs().find((t) => t.id === tab.id)
    expect(updated?.kind).toBe('shell')
    expect(updated?.sessionName).toBeNull()
  })

  it('does not attempt detection once a tab is already a session tab', async () => {
    const tab = await createLocalShellTab()
    detectTabSession.mockImplementation(async () => 'mx')
    updateTabLabel(tab.id, 'mx')
    await flush()
    expect(getTabs().find((t) => t.id === tab.id)?.kind).toBe('session')

    detectTabSession.mockClear()
    updateTabLabel(tab.id, 'mx-renamed')
    await flush()

    expect(detectTabSession).not.toHaveBeenCalled()
  })
})

describe('openTmuxHere', () => {
  it('marks the tab as tmuxStarted and promotes it once a session is detected', async () => {
    const tab = await createLocalShellTab()
    expect(canOpenTmuxHere(tab)).toBe(true)
    detectTabSession.mockImplementation(async (tabId: string) => (tabId === tab.id ? 'my-project' : ''))

    await openTmuxHere(tab.id)
    await flush()

    expect(writeTab).toHaveBeenCalledWith(tab.id, expect.any(String))
    const updated = getTabs().find((t) => t.id === tab.id)
    expect(updated?.tmuxStarted).toBe(true)
    expect(updated?.kind).toBe('session')
    expect(updated?.sessionName).toBe('my-project')
  })

  it('is a no-op for a tab that already has tmux running', async () => {
    const tab = await createLocalShellTab()
    tabs$.items.set((current) => current.map((t) => (t.id === tab.id ? { ...t, tmuxStarted: true } : t)))

    await openTmuxHere(tab.id)

    expect(writeTab).not.toHaveBeenCalled()
  })
})
