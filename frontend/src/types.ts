export type TabKind = 'shell' | 'session' | 'remote'

export interface Tab {
  id: string
  kind: TabKind
  label: string
  sessionName: string | null
  serverName?: string | null
  color?: string | null
}
