import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { AttachRemoteSession, DetectTabSession, WriteTab } from '../../bindings/tmiix/app'
import {
  canOpenTmuxHere,
  getTabs,
  openLocalShell,
  openRemoteShell,
  openTmuxHere,
  reconnectTab,
  tabs$,
  updateTabLabel,
} from './tabs'

const detectTabSession = DetectTabSession as unknown as ReturnType<typeof import('bun:test').mock>
const attachRemoteSession = AttachRemoteSession as unknown as ReturnType<typeof import('bun:test').mock>
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
  attachRemoteSession.mockReset()
  attachRemoteSession.mockImplementation(async () => {})
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

  // Without this, "Kill session" is unavailable on an ssh tab where the user
  // started tmux by hand, since the tab never learns it holds a session.
  it('promotes a remote shell tab to a remote session tab', async () => {
    await openRemoteShell('box')
    const tab = getTabs().at(-1)
    if (!tab) throw new Error('expected a tab to be created')
    detectTabSession.mockImplementation(async (tabId: string) => (tabId === tab.id ? 'hibi' : ''))

    updateTabLabel(tab.id, 'hibi')
    await flush()

    const updated = getTabs().find((t) => t.id === tab.id)
    expect(updated?.kind).toBe('remote')
    expect(updated?.serverName).toBe('box')
    expect(updated?.sessionName).toBe('hibi')
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

describe('manual reconnect', () => {
  it('ignores a failure from an older reconnect cycle', async () => {
    tabs$.items.set([
      {
        id: 'remote-1',
        kind: 'remote',
        label: 'box:work',
        serverName: 'box',
        sessionName: 'work',
        color: null,
        status: 'disconnected',
      },
    ])

    let rejectFirst: (error: Error) => void = () => {}
    attachRemoteSession.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectFirst = reject
        }),
    )

    reconnectTab('remote-1')
    reconnectTab('remote-1')
    await flush()
    rejectFirst(new Error('stale reconnect failed'))
    await flush()

    expect(attachRemoteSession).toHaveBeenCalledTimes(2)
    expect(getTabs()[0].status).toBe('connected')
  })
})
