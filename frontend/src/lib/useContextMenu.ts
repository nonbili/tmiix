import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

export function useContextMenu() {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('contextmenu', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('contextmenu', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const onContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setPosition({ x: event.clientX, y: event.clientY })
    setOpen(true)
  }

  const close = () => setOpen(false)

  return { open, position, ref, onContextMenu, close }
}
