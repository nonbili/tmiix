import { useValue } from '@legendapp/state/react'
import { handleTabClosedFromBackend, tabs$ } from '../../state/tabs'
import { ui$ } from '../../state/ui'
import { BlankPage } from './BlankPage'
import { TerminalTab } from './TerminalTab'

export function TerminalWorkspace() {
  const tabs = useValue(tabs$.items)
  const activeTabId = useValue(tabs$.activeTabId)
  const themeId = useValue(ui$.themeId)

  return (
    <main className="flex flex-col bg-background min-w-0 overflow-hidden flex-1">
      <div
        className="relative flex-1 min-h-0 transition-colors duration-[120ms] ease-in-out"
        style={{ background: 'var(--terminal-bg)' }}
      >
        {tabs.length === 0 && <BlankPage />}
        {tabs.map((tab) => (
          <TerminalTab
            key={tab.id}
            tabId={tab.id}
            active={tab.id === activeTabId}
            themeId={themeId}
            onClosed={() => handleTabClosedFromBackend(tab.id)}
          />
        ))}
      </div>
    </main>
  )
}
