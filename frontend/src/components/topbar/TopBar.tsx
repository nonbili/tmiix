import { useValue } from '@legendapp/state/react'
import { useEffect, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { PanelLeftClose, PanelLeftOpen, Plus, X } from 'lucide-react'
import { WindowIsFullscreen } from '../../../wailsjs/runtime/runtime'
import { isMac } from '../../lib/keybindings'
import { closeTab, reorderTabs, setActiveTabId, tabs$ } from '../../state/tabs'
import { openPalette, toggleSidebar, ui$ } from '../../state/ui'
import { MiddleTruncate } from '../MiddleTruncate'
import { Tab } from '../../types'
import { TopBarMenu } from './TopBarMenu'

interface SortableTabProps {
  tab: Tab
  idx: number
  active: boolean
  onClose: (id: string) => void
  onSelect: (id: string) => void
}

function SortableTab({ tab, idx, active, onClose, onSelect }: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : undefined,
    pointerEvents: isDragging ? ('none' as const) : undefined,
    '--wails-draggable': 'no-drag',
  }

  const hotkeyHint = idx < 9 ? ` (Alt+${idx + 1})` : ''

  return (
    <div
      ref={setNodeRef}
      style={style as any}
      {...attributes}
      {...listeners}
      className={`group flex items-center gap-1.5 h-[26px] pl-2.5 pr-1 rounded-[4px] border cursor-move text-xs shrink-0 transition-all duration-150 ${
        active
          ? 'bg-muted border-border-strong text-foreground-strong shadow-sm'
          : 'bg-transparent border-transparent text-foreground-muted hover:bg-elevated hover:text-foreground hover:border-border'
      }`}
      onClick={() => onSelect(tab.id)}
      title={`${tab.label}${hotkeyHint}`}
    >
      <span
        className={`rounded-full shrink-0 transition-all duration-150 w-1.5 h-1.5 ${active ? '' : 'opacity-70'}`}
        style={{
          backgroundColor: tab.color || '#3fb950',
          boxShadow: active ? `0 0 8px ${tab.color || '#3fb950'}80` : 'none',
        }}
      />
      <MiddleTruncate text={tab.label} className="max-w-[160px]" />
      <button
        className={`w-4 h-4 inline-flex items-center justify-center rounded-[3px] hover:bg-border-strong hover:text-foreground-strong bg-transparent border-0 p-0 ml-0.5 transition-colors ${
          active ? 'text-foreground-muted' : 'text-foreground-subtle'
        }`}
        style={{ '--wails-draggable': 'no-drag' } as any}
        onClick={(e) => {
          e.stopPropagation()
          onClose(tab.id)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        title="Close tab"
        aria-label="Close tab"
        type="button"
      >
        <span className="scale-[0.85] inline-flex">
          <X size={10} strokeWidth={1.8} />
        </span>
      </button>
    </div>
  )
}

export function TopBar() {
  const sidebarCollapsed = useValue(ui$.sidebarCollapsed)
  const tabs = useValue(tabs$.items)
  const activeTabId = useValue(tabs$.activeTabId)
  const [fullscreen, setFullscreen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = tabs.findIndex((t) => t.id === active.id)
      const newIndex = tabs.findIndex((t) => t.id === over.id)
      reorderTabs(oldIndex, newIndex)
    }
  }

  useEffect(() => {
    if (!isMac) return

    let cancelled = false
    const refreshFullscreen = () => {
      WindowIsFullscreen()
        .then((isFullscreen) => {
          if (!cancelled) setFullscreen(isFullscreen)
        })
        .catch(() => {
          if (!cancelled) setFullscreen(false)
        })
    }
    const refreshAfterTransition = () => {
      refreshFullscreen()
      window.setTimeout(refreshFullscreen, 500)
    }

    refreshFullscreen()
    window.addEventListener('resize', refreshAfterTransition)
    window.addEventListener('focus', refreshFullscreen)
    document.addEventListener('visibilitychange', refreshFullscreen)

    return () => {
      cancelled = true
      window.removeEventListener('resize', refreshAfterTransition)
      window.removeEventListener('focus', refreshFullscreen)
      document.removeEventListener('visibilitychange', refreshFullscreen)
    }
  }, [])

  return (
    <header
      className={`flex gap-1 bg-surface border-b border-border select-none rounded-none ${
        isMac && !fullscreen ? 'h-[34px] items-center pl-[92px] pr-2' : 'h-[34px] items-center px-2'
      }`}
      style={{ '--wails-draggable': 'drag' } as any}
    >
      <button
        className="w-6 h-6 text-foreground-muted hover:text-foreground-strong hover:bg-muted hover:border-border inline-flex items-center justify-center rounded-[3px] border border-transparent shrink-0"
        style={{ '--wails-draggable': 'no-drag' } as any}
        onClick={toggleSidebar}
        title={sidebarCollapsed ? 'Show sidebar (Ctrl+\\)' : 'Hide sidebar (Ctrl+\\)'}
        aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        type="button"
      >
        {sidebarCollapsed ? <PanelLeftOpen size={14} strokeWidth={1.7} /> : <PanelLeftClose size={14} strokeWidth={1.7} />}
      </button>

      <div
        className="flex items-center gap-0.5 min-w-0 overflow-x-auto flex-1"
        style={{ '--wails-draggable': 'drag' } as any}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToHorizontalAxis]}
        >
          <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
            {tabs.map((tab, idx) => (
              <SortableTab
                key={tab.id}
                tab={tab}
                idx={idx}
                active={tab.id === activeTabId}
                onClose={closeTab}
                onSelect={setActiveTabId}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button
          className="w-6 h-[26px] inline-flex items-center justify-center rounded-[4px] text-foreground-muted hover:text-foreground-strong hover:bg-muted bg-transparent border border-transparent hover:border-border shrink-0"
          style={{ '--wails-draggable': 'no-drag' } as any}
          onClick={() => openPalette('new')}
          title="New session (Ctrl+T)"
          aria-label="New session"
          type="button"
        >
          <Plus size={14} strokeWidth={1.8} />
        </button>
      </div>

      <div style={{ '--wails-draggable': 'no-drag' } as any}>
        <TopBarMenu />
      </div>
    </header>
  )
}
