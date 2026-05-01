import type { KeyboardEventHandler, ReactNode } from 'react'

interface PaletteDialogProps {
  open: boolean
  onClose: () => void
  ariaLabel: string
  overlayClassName: string
  panelClassName: string
  header: ReactNode
  body: ReactNode
  footer?: ReactNode
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
}

export function PaletteDialog({
  open,
  onClose,
  ariaLabel,
  overlayClassName,
  panelClassName,
  header,
  body,
  footer,
  onKeyDown,
}: PaletteDialogProps) {
  if (!open) return null

  return (
    <div
      className={overlayClassName}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={onKeyDown}
    >
      <div className={panelClassName} role="dialog" aria-modal="true" aria-label={ariaLabel}>
        {header}
        {body}
        {footer}
      </div>
    </div>
  )
}
