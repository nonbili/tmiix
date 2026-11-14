import { mock } from 'bun:test'

// tabs.ts uses `window.setTimeout`/`window.clearTimeout` for retry delays.
// There's no DOM in `bun test`, so provide a minimal shim — and collapse
// every delay to the next tick so retry-loop tests don't need to wait on
// real wall-clock timers.
;(globalThis as any).window = {
  setTimeout: (fn: (...args: unknown[]) => void, _ms?: number, ...args: unknown[]) => setTimeout(fn, 0, ...args),
  clearTimeout: (id: unknown) => clearTimeout(id as Parameters<typeof clearTimeout>[0]),
}

// Everything under src/state/ ultimately imports Wails-generated bindings.
// That directory is build-generated and gitignored, so mock it here rather
// than depending on it existing on disk.
mock.module('../../bindings/tmiix/app', () => ({
  AttachRemoteSession: mock(async () => {}),
  AttachSession: mock(async () => {}),
  CloseTab: mock(async () => {}),
  DetectTabSession: mock(async () => ''),
  KillRemoteSession: mock(async () => {}),
  KillSession: mock(async () => {}),
  ListRemoteSessions: mock(async () => [] as string[]),
  ListRemoteSessionsQuiet: mock(async () => [] as string[]),
  ListSessions: mock(async () => [] as string[]),
  ListSSHConfigHosts: mock(async () => []),
  ListSSHServers: mock(async () => []),
  OpenRemoteShell: mock(async () => {}),
  OpenShell: mock(async () => {}),
  WriteTab: mock(async () => {}),
}))

mock.module('../../bindings/tmiix/models', () => ({}))
