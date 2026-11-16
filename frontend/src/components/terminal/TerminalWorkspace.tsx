import { useValue } from '@legendapp/state/react'
import { handleTabClosedFromBackend, tabs$ } from '../../state/tabs'
import { ui$ } from '../../state/ui'
import { BlankPage } from './BlankPage'
import { TerminalTab } from './TerminalTab'

export function TerminalWorkspace() {
  const tabs = useValue(tabs$.items)
  const activeTabId = useValue(tabs$.activeTabId)
  const themeId = useValue(ui$.themeId)
  // These panels overlap, so their DOM order need not follow the tab bar.
  // Keep it stable: moving a live xterm host can blank its renderer and lose focus.
  const terminalTabs = [...tabs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  return (
    <main className="flex flex-col bg-background min-w-0 overflow-hidden flex-1">
      <div
        className="relative flex-1 min-h-0 overflow-hidden transition-colors duration-[120ms] ease-in-out"
        style={{ background: 'var(--terminal-bg)' }}
      >
        {tabs.length === 0 && <BlankPage />}
        {terminalTabs.map((tab) => (
          <TerminalTab
            key={tab.id}
            tab={tab}
            tabId={tab.id}
            active={tab.id === activeTabId}
            themeId={themeId}
            onClosed={(clean) => handleTabClosedFromBackend(tab.id, clean)}
          />
        ))}
      </div>
    </main>
  )
}
