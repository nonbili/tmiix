import { useEffect, useRef, type ReactNode } from 'react'

interface PaletteListProps<T> {
  items: T[]
  selectedIndex: number
  onSelectIndex: (index: number) => void
  onActivate: (item: T) => void | Promise<void>
  getKey: (item: T, index: number) => string
  renderItem: (item: T, state: { selected: boolean; index: number }) => ReactNode
  empty: ReactNode
  className: string
}

export function PaletteList<T>({
  items,
  selectedIndex,
  onSelectIndex,
  onActivate,
  getKey,
  renderItem,
  empty,
  className,
}: PaletteListProps<T>) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const node = itemRefs.current[selectedIndex]
    node?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <div className={className}>
      {items.length === 0
        ? empty
        : items.map((item, index) => (
            <button
              key={getKey(item, index)}
              ref={(el) => {
                itemRefs.current[index] = el
              }}
              className="block w-full border-0 bg-transparent p-0 text-left cursor-pointer"
              onMouseEnter={() => onSelectIndex(index)}
              onClick={() => void onActivate(item)}
              type="button"
            >
              {renderItem(item, { selected: selectedIndex === index, index })}
            </button>
          ))}
    </div>
  )
}
