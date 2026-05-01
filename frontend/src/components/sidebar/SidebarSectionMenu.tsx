import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { TAB_COLORS } from '../../lib/session'

export type SectionMenuItem =
  | { kind: 'colors'; value?: string; onChange: (color: string) => void }
  | { kind: 'button'; label: string; onClick: () => void; danger?: boolean }

interface Props {
  items: SectionMenuItem[]
  position: { x: number; y: number }
  innerRef: React.RefObject<HTMLDivElement>
  onClose: () => void
}

export function SidebarSectionMenu({ items, position, innerRef, onClose }: Props) {
  const [colorMenuOpen, setColorMenuOpen] = useState(false)

  return (
    <div
      ref={innerRef}
      className="fixed z-50 flex min-w-[120px] flex-col gap-1.5 rounded-md border border-border bg-elevated p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, i) => {
        if (item.kind === 'colors') {
          return (
            <div
              key={i}
              className="relative"
              onMouseEnter={() => setColorMenuOpen(true)}
              onMouseLeave={() => setColorMenuOpen(false)}
            >
              <button
                className="flex w-full items-center gap-2 text-left text-[11px] normal-case tracking-normal text-foreground hover:text-foreground-strong hover:bg-muted bg-transparent border-0 cursor-pointer rounded px-2 py-1"
                onClick={(event) => {
                  event.stopPropagation()
                  setColorMenuOpen((open) => !open)
                }}
                onFocus={() => setColorMenuOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight') setColorMenuOpen(true)
                  if (event.key === 'Escape') setColorMenuOpen(false)
                }}
                aria-haspopup="menu"
                aria-expanded={colorMenuOpen}
                type="button"
              >
                <span className="flex-1">Color</span>
                <span
                  className="h-3 w-3 rounded-full border border-border shrink-0"
                  style={{ backgroundColor: item.value || 'transparent' }}
                />
                <span className="text-foreground-subtle">
                  <ChevronRight size={10} strokeWidth={2} />
                </span>
              </button>
              {colorMenuOpen ? (
                <>
                  <div className="absolute left-full top-0 h-full w-2" />
                  <div
                    className="absolute left-[calc(100%+6px)] top-[-2px] z-10 rounded-md border border-border bg-elevated p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
                    role="menu"
                  >
                    <ColorGrid value={item.value} onChange={item.onChange} onClose={onClose} />
                  </div>
                </>
              ) : null}
            </div>
          )
        }
        return (
          <button
            key={i}
            className={`text-left text-[11px] normal-case tracking-normal bg-transparent border-0 cursor-pointer rounded px-2 py-1 ${
              item.danger
                ? 'text-term-red hover:bg-term-red/10'
                : 'text-foreground hover:text-foreground-strong hover:bg-muted'
            }`}
            onClick={(event) => {
              event.stopPropagation()
              item.onClick()
              onClose()
            }}
            type="button"
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function ColorGrid({
  value,
  onChange,
  onClose,
}: {
  value?: string
  onChange: (color: string) => void
  onClose: () => void
}) {
  return (
    <div className="grid w-[116px] grid-cols-6 gap-1">
      {TAB_COLORS.slice(0, 11).map((option) => (
        <button
          key={option}
          className={`w-4 h-4 rounded-full border cursor-pointer transition-transform hover:scale-110 ${
            option === value ? 'border-fg-0' : 'border-border'
          }`}
          style={{ backgroundColor: option }}
          onClick={(event) => {
            event.stopPropagation()
            onChange(option)
            onClose()
          }}
          title={`Set color ${option}`}
          type="button"
        />
      ))}
      <button
        className={`w-4 h-4 rounded-full border cursor-pointer transition-transform hover:scale-110 flex items-center justify-center text-[12px] leading-none ${
          !value ? 'border-fg-0' : 'border-border'
        }`}
        style={{ backgroundColor: 'transparent' }}
        onClick={(event) => {
          event.stopPropagation()
          onChange('')
          onClose()
        }}
        title="Reset color"
        type="button"
      >
        ×
      </button>
    </div>
  )
}
