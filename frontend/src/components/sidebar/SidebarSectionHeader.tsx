import type { MouseEventHandler } from 'react'
import { ChevronRight, PowerOff, RefreshCw } from 'lucide-react'
import { MiddleTruncate } from '../MiddleTruncate'
import { IconButton } from '../button/IconButton'

export type SectionStatus = 'idle' | 'loading' | 'connected' | 'error'

interface SidebarSectionHeaderProps {
  title: string
  expanded: boolean
  onToggle: () => void
  count?: number
  color?: string
  loading?: boolean
  status?: SectionStatus
  titleTooltip?: string
  borderedTop?: boolean
  rightSlot?: React.ReactNode
  onContextMenu?: MouseEventHandler
  onRefresh?: () => void
  onDisconnect?: () => void
}

export function SidebarSectionHeader({
  title,
  expanded,
  onToggle,
  count,
  color,
  loading,
  status,
  titleTooltip,
  borderedTop,
  rightSlot,
  onContextMenu,
  onRefresh,
  onDisconnect,
}: SidebarSectionHeaderProps) {
  return (
    <div
      className={`relative flex items-center justify-between h-7 pl-3 pr-2 border-b border-border text-foreground-subtle text-[11px] uppercase tracking-[0.08em] bg-surface group border-l-2 border-l-transparent ${
        borderedTop ? 'border-t mt-[-1px]' : ''
      }`}
    >
      <button
        className="relative flex-1 flex items-center bg-transparent border-0 cursor-pointer text-left min-w-0 uppercase tracking-[0.08em] hover:text-foreground"
        onClick={onToggle}
        onContextMenu={onContextMenu}
        type="button"
        title={titleTooltip}
      >
        <span className="mr-2 w-1.5 h-1.5 inline-flex items-center justify-center flex-shrink-0">
          {status ? (
            <span
              className={`w-1.5 h-1.5 rounded-full ${status === 'loading' ? 'animate-pulse' : ''}`}
              style={{
                backgroundColor:
                  status === 'connected'
                    ? color || 'var(--color-term-green)'
                    : status === 'error'
                      ? 'var(--color-term-red)'
                      : status === 'loading'
                        ? color || 'var(--color-accent)'
                        : 'var(--color-foreground-subtle)',
                boxShadow: status === 'connected' ? `0 0 6px ${color || '#3fb950'}99` : 'none',
              }}
              aria-label={`status: ${status}`}
            />
          ) : null}
        </span>
        <MiddleTruncate text={title} className="mr-1.5" style={{ color: color || undefined }} />
        {typeof count === 'number' ? (
          <span className="text-foreground-muted bg-elevated border border-border rounded-[10px] px-1.5 text-[10px] leading-4 tracking-normal normal-case mr-auto">
            {count}
          </span>
        ) : (
          <span className="mr-auto" />
        )}
        {loading ? <span className="text-[10px] normal-case tracking-normal animate-pulse mr-1">…</span> : null}
      </button>
      <div className="flex items-center gap-2">
        {rightSlot}
        <div className="relative w-4 h-4 flex items-center justify-center">
          <span className="absolute inset-0 opacity-40 flex items-center justify-center translate-y-px group-hover:opacity-0 transition-opacity duration-[120ms] pointer-events-none">
            <ChevronRight
              size={10}
              strokeWidth={2}
              className={`transition-transform duration-[120ms] ${expanded ? 'rotate-90' : ''}`}
            />
          </span>
          {onRefresh && (
            <IconButton
              icon={<RefreshCw size={14} strokeWidth={1.7} />}
              title="Refresh"
              size={16}
              className="absolute inset-0 opacity-0 group-hover:opacity-100 text-foreground-subtle hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onRefresh()
              }}
            />
          )}
          {onDisconnect && (
            <IconButton
              icon={<PowerOff size={14} strokeWidth={1.7} />}
              title="Disconnect"
              size={16}
              className="absolute inset-0 opacity-0 group-hover:opacity-100 text-foreground-subtle hover:text-term-red"
              onClick={(e) => {
                e.stopPropagation()
                onDisconnect()
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
