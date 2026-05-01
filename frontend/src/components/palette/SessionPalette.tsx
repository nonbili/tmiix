import { useValue } from '@legendapp/state/react'
import { useEffect, useRef } from 'react'
import { PaletteDialog } from './PaletteDialog'
import { PaletteList } from './PaletteList'
import { FooterHint } from './FooterHint'
import {
  getPaletteItems,
  paletteItemKey,
  refreshRemoteSessions,
  refreshSessions,
  sessions$,
  type PaletteItem,
} from '../../state/sessions'
import {
  attachRemote,
  attachSession,
  getActiveRemote,
  getActiveSession,
  openLocalShell,
  openRemoteShell,
  switchActiveTabRemote,
  switchActiveTabSession,
} from '../../state/tabs'
import { remoteKey } from '../../lib/session'
import { servers$ } from '../../state/servers'
import { loadServerSessions, sidebar$ } from '../../state/sidebar'
import { closePalette, setPaletteIndex, setPaletteQuery, ui$ } from '../../state/ui'

export function SessionPalette() {
  const open = useValue(ui$.palette.open)
  const mode = useValue(ui$.palette.mode)
  const query = useValue(ui$.palette.query)
  const recentSessions = useValue(sessions$.recent)
  const selectedIndex = useValue(ui$.palette.index)
  useValue(sessions$.items)
  useValue(sessions$.remote)
  useValue(servers$.items)
  const sidebarStates = useValue(sidebar$.servers)
  const items = getPaletteItems()
  const currentSession = getActiveSession()
  const currentRemote = getActiveRemote()
  const title = mode === 'new' ? 'Attach session in new tab' : 'Switch session in current tab'
  const placeholder = mode === 'new' ? 'Attach tmux session (new tab)' : 'Switch tmux session (current tab)'
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    void refreshSessions().catch(() => {})
    for (const name of Object.keys(sessions$.remote.peek())) {
      void refreshRemoteSessions(name).catch(() => {})
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setPaletteIndex(items.length === 0 ? 0 : Math.min(selectedIndex, items.length - 1))
  }, [open, selectedIndex, items.length])

  const handleSelect = async (item: PaletteItem) => {
    if (item.kind === 'connect-server') {
      const state = sidebar$.servers[item.serverName].peek()?.state
      if (state !== 'loading') void loadServerSessions(item.serverName)
      return
    }
    closePalette()
    if (item.kind === 'shell-local') {
      await openLocalShell()
      return
    }
    if (item.kind === 'shell-remote') {
      await openRemoteShell(item.serverName)
      return
    }
    if (item.kind === 'remote') {
      if (mode === 'switch') {
        await switchActiveTabRemote(item.serverName, item.name)
        return
      }
      await attachRemote(item.serverName, item.name)
      return
    }
    if (mode === 'switch') {
      await switchActiveTabSession(item.name)
      return
    }
    await attachSession(item.name)
  }

  const handleSubmit = async () => {
    const selected = items[selectedIndex]
    if (!selected) return
    await handleSelect(selected)
  }

  return (
    <PaletteDialog
      open={open}
      onClose={closePalette}
      ariaLabel="Session switcher"
      overlayClassName="fixed inset-0 grid place-items-start justify-center pt-18 max-[720px]:pt-7 bg-overlay backdrop-blur-md z-20"
      panelClassName="w-[min(640px,calc(100vw-32px))] bg-surface border border-border shadow-[0_18px_60px_rgba(0,0,0,0.30)] rounded-xl overflow-hidden"
      header={
        <div className="px-4 pt-3 pb-2 border-b border-border">
          <div className="text-[10px] uppercase tracking-[0.1em] text-foreground-subtle mb-1.5">{title}</div>
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-accent-soft text-accent text-xs shrink-0">
              {mode === 'new' ? '+' : '⇄'}
            </span>
            <input
              ref={inputRef}
              className="w-full bg-transparent border-0 outline-0 text-foreground-strong font-[inherit] text-sm placeholder:text-foreground-subtle"
              value={query}
              onChange={(event) => setPaletteQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleSubmit()
                }
              }}
              placeholder={placeholder}
            />
          </div>
        </div>
      }
      body={
        <PaletteList
          items={items}
          selectedIndex={selectedIndex}
          onSelectIndex={setPaletteIndex}
          onActivate={handleSelect}
          getKey={(item) => paletteItemKey(item)}
          className="p-2 max-h-[min(50vh,420px)] overflow-auto"
          empty={<div className="px-3.5 py-4 text-foreground-subtle text-xs">No matching sessions.</div>}
          renderItem={(item, { selected }) => {
            const isShell = item.kind === 'shell-local' || item.kind === 'shell-remote'
            const isActive =
              item.kind === 'local'
                ? currentSession === item.name
                : item.kind === 'remote'
                  ? currentRemote === remoteKey(item.serverName, item.name)
                  : false
            const isRecent = item.kind === 'local' && recentSessions.includes(item.name)
            const dotColor =
              item.kind === 'remote' || item.kind === 'shell-remote' || item.kind === 'connect-server'
                ? item.color || '#3fb950'
                : '#3fb950'
            const connectState =
              item.kind === 'connect-server' ? sidebarStates[item.serverName]?.state : undefined
            const label =
              item.kind === 'shell-local'
                ? 'Open local shell'
                : item.kind === 'shell-remote'
                  ? `Open shell on ${item.serverName}`
                  : item.kind === 'connect-server'
                    ? `Connect to ${item.serverName}`
                    : null
            const tag = isActive
              ? 'live'
              : item.kind === 'remote'
                ? 'remote'
                : item.kind === 'shell-local'
                  ? 'shell'
                  : item.kind === 'shell-remote'
                    ? 'shell'
                    : item.kind === 'connect-server'
                      ? connectState === 'loading'
                        ? 'connecting…'
                        : connectState === 'error'
                          ? 'error'
                          : 'connect'
                      : isRecent
                        ? 'recent'
                        : ''
            return (
              <div
                className={`w-full flex items-center gap-2.5 border-0 cursor-pointer px-3 py-2.5 rounded-lg text-left ${
                  selected
                    ? 'bg-accent-soft text-foreground-strong'
                    : 'bg-transparent text-foreground hover:bg-accent-soft hover:text-foreground-strong'
                }`}
              >
                <span
                  className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: isShell ? 'var(--fg-3)' : isActive ? dotColor : 'var(--fg-3)',
                    boxShadow: isActive && !isShell ? `0 0 10px ${dotColor}99` : 'none',
                  }}
                />
                <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[13px]">
                  {item.kind === 'remote' ? (
                    <>
                      <span className="text-foreground-subtle mr-1" style={{ color: item.color || undefined }}>
                        {item.serverName}:
                      </span>
                      {item.name}
                    </>
                  ) : item.kind === 'connect-server' ? (
                    <>
                      <span className="text-foreground-subtle mr-1" style={{ color: item.color || undefined }}>
                        {item.serverName}:
                      </span>
                      {label}
                    </>
                  ) : item.kind === 'local' ? (
                    item.name
                  ) : (
                    label
                  )}
                </span>
                <span className="text-foreground-subtle text-[10px] tracking-[0.08em] uppercase">{tag}</span>
              </div>
            )
          }}
        />
      }
      footer={
        <div className="flex items-center gap-4 px-3.5 pt-2.5 pb-3 border-t border-border text-foreground-subtle text-[10px] tracking-[0.08em] uppercase max-[720px]:flex-wrap max-[720px]:gap-y-2">
          <FooterHint keyLabel="Enter" action={mode === 'new' ? 'attach in new tab' : 'switch in current tab'} />
          <FooterHint keyLabel="Esc" action="close" />
          <FooterHint keyLabel="↑↓" action="navigate" />
        </div>
      }
    />
  )
}
