import { useEffect, useMemo, useRef, useState } from 'react'
import { main } from '../../../wailsjs/go/models'
import { PaletteDialog } from './PaletteDialog'
import { PaletteList } from './PaletteList'
import { FooterHint } from './FooterHint'

interface RemoteServerPaletteProps {
  open: boolean
  initialConnectMode?: boolean
  servers: main.SSHServer[]
  onClose: () => void
  onSelectServer: (server: main.SSHServer) => void | Promise<void>
  onSubmitCommand: (command: string) => void | Promise<void>
}

type PaletteItem = { kind: 'connect' } | { kind: 'server'; server: main.SSHServer }

export function RemoteServerPalette({
  open,
  initialConnectMode = false,
  servers,
  onClose,
  onSelectServer,
  onSubmitCommand,
}: RemoteServerPaletteProps) {
  const [connectMode, setConnectMode] = useState(false)
  const [query, setQuery] = useState('')
  const [command, setCommand] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const filteredServers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return servers
    return servers.filter((server) =>
      [server.name, server.host, server.user, server.identityFile]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalized)),
    )
  }, [query, servers])

  const items = useMemo<PaletteItem[]>(
    () => [{ kind: 'connect' as const }, ...filteredServers.map((server) => ({ kind: 'server' as const, server }))],
    [filteredServers],
  )

  useEffect(() => {
    if (!open) return
    setConnectMode(initialConnectMode)
    setQuery('')
    setCommand('')
    setSelectedIndex(0)
    setSubmitting(false)
    setError(null)
  }, [initialConnectMode, open])

  useEffect(() => {
    if (!open) return
    setSelectedIndex((current) => Math.min(current, Math.max(items.length - 1, 0)))
  }, [items.length, open])

  useEffect(() => {
    if (!open) return
    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }, [connectMode, open])

  const runAction = async (action: () => Promise<void>) => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await action()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const activateItem = async () => {
    const item = items[selectedIndex]
    if (!item) return
    if (item.kind === 'connect') {
      setConnectMode(true)
      setSelectedIndex(0)
      return
    }
    await runAction(() => Promise.resolve(onSelectServer(item.server)))
  }

  const title = connectMode ? 'Connect to new server' : 'Remote projects'
  const placeholder = connectMode ? 'ssh user@example -p 2222' : 'Search SSH hosts'

  return (
    <PaletteDialog
      open={open}
      onClose={onClose}
      ariaLabel="Remote projects"
      overlayClassName="fixed inset-0 grid place-items-start justify-center pt-18 max-[720px]:pt-7 bg-overlay backdrop-blur-md z-20"
      panelClassName="w-[min(640px,calc(100vw-32px))] bg-surface border border-border shadow-[0_18px_60px_rgba(0,0,0,0.30)] rounded-xl overflow-hidden"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          if (connectMode) {
            event.stopPropagation()
            setConnectMode(false)
            setCommand('')
            setError(null)
            setSelectedIndex(0)
            return
          }
          onClose()
          return
        }
        if (event.key === 'ArrowDown' || (event.ctrlKey && event.key.toLowerCase() === 'n')) {
          event.preventDefault()
          setSelectedIndex((current) => (items.length === 0 ? 0 : (current + 1) % items.length))
          return
        }
        if (event.key === 'ArrowUp' || (event.ctrlKey && event.key.toLowerCase() === 'p')) {
          event.preventDefault()
          setSelectedIndex((current) => (items.length === 0 ? 0 : (current - 1 + items.length) % items.length))
          return
        }
        if (event.key === 'Enter' && !connectMode) {
          event.preventDefault()
          void activateItem()
        }
      }}
      header={
        <div className="px-4 pt-3 pb-2 border-b border-border">
          <div className="text-[10px] uppercase tracking-[0.1em] text-foreground-subtle mb-1.5">{title}</div>
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-accent-soft text-accent text-xs shrink-0">
              {connectMode ? '+' : '□'}
            </span>
            {connectMode ? (
              <input
                ref={inputRef}
                className="w-full bg-transparent border-0 outline-0 text-foreground-strong font-[inherit] text-sm placeholder:text-foreground-subtle"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void runAction(() => Promise.resolve(onSubmitCommand(command)))
                  }
                }}
                placeholder={placeholder}
              />
            ) : (
              <input
                ref={inputRef}
                className="w-full bg-transparent border-0 outline-0 text-foreground-strong font-[inherit] text-sm placeholder:text-foreground-subtle"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSelectedIndex(0)
                }}
                placeholder={placeholder}
              />
            )}
          </div>
        </div>
      }
      body={
        connectMode ? (
          <div className="p-2 max-h-[min(50vh,420px)] overflow-auto">
            <div className="px-3 py-2 text-foreground-subtle text-xs leading-[1.6]">
              Enter the command you use to SSH into this server.
            </div>
          </div>
        ) : (
          <PaletteList
            items={items}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            onActivate={(item) => {
              if (item.kind === 'connect') {
                setConnectMode(true)
                setSelectedIndex(0)
                return
              }
              return runAction(() => Promise.resolve(onSelectServer(item.server)))
            }}
            getKey={(item) => (item.kind === 'connect' ? 'connect' : item.server.name)}
            className="p-2 max-h-[min(50vh,420px)] overflow-auto"
            empty={
              <div className="px-3.5 py-4 text-foreground-subtle text-xs">
                {servers.length === 0 ? 'No SSH hosts found.' : 'No SSH hosts match your search.'}
              </div>
            }
            renderItem={(item, { selected }) =>
              item.kind === 'connect' ? (
                <div
                  className={`w-full flex items-center gap-2.5 border-0 cursor-pointer px-3 py-2.5 rounded-lg text-left ${
                    selected
                      ? 'bg-accent-soft text-foreground-strong'
                      : 'bg-transparent text-foreground hover:bg-accent-soft hover:text-foreground-strong'
                  }`}
                >
                  <span
                    className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                  />
                  <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[13px]">
                    Connect to new server
                  </span>
                  <span className="text-foreground-subtle text-[10px] tracking-[0.08em] uppercase">new</span>
                </div>
              ) : (
                <div
                  className={`w-full flex items-center gap-2.5 border-0 cursor-pointer px-3 py-2.5 rounded-lg text-left ${
                    selected
                      ? 'bg-accent-soft text-foreground-strong'
                      : 'bg-transparent text-foreground hover:bg-accent-soft hover:text-foreground-strong'
                  }`}
                  title={serverTooltip(item.server)}
                >
                  <span
                    className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: item.server.color || 'var(--color-foreground-subtle)',
                      boxShadow: item.server.color ? `0 0 10px ${item.server.color}99` : 'none',
                    }}
                  />
                  <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[13px]">
                    {item.server.name}
                    <span className="text-foreground-subtle ml-2">{serverTooltip(item.server)}</span>
                  </span>
                  {item.server.fromConfig ? (
                    <span className="text-foreground-subtle text-[10px] tracking-[0.08em] uppercase">config</span>
                  ) : null}
                </div>
              )
            }
          />
        )
      }
      footer={
        <div className="flex items-center gap-4 px-3.5 pt-2.5 pb-3 border-t border-border text-foreground-subtle text-[10px] tracking-[0.08em] uppercase max-[720px]:flex-wrap max-[720px]:gap-y-2">
          {error ? (
            <span className="flex-1 min-w-0 normal-case tracking-normal text-[11px] text-term-red whitespace-nowrap overflow-hidden text-ellipsis">
              {error}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          <FooterHint keyLabel="Enter" action="select" />
          <FooterHint keyLabel="Esc" action="close" />
          <FooterHint keyLabel="↑↓" action="navigate" />
        </div>
      }
    />
  )
}

function serverTooltip(s: main.SSHServer) {
  const target = s.user ? `${s.user}@${s.host}` : s.host
  const port = s.port ? `:${s.port}` : ''
  return `${target}${port}`
}
