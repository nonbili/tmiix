export type TabKind = 'shell' | 'session' | 'remote'

export type TabStatus = 'connected' | 'reconnecting' | 'disconnected'

export interface Tab {
  id: string
  kind: TabKind
  label: string
  sessionName: string | null
  serverName?: string | null
  color?: string | null
  tmuxStarted?: boolean
  // Connection lifecycle for remote tabs. Undefined means connected/normal.
  status?: TabStatus
  // 1-based attempt counter while status === 'reconnecting'.
  reconnectAttempt?: number
}
