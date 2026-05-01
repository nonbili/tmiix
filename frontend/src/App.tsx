import { AppBootstrap } from './components/app/AppBootstrap'
import { AppHotkeys } from './components/app/AppHotkeys'
import { AppPersistence } from './components/app/AppPersistence'
import { AboutDialog } from './components/dialog/AboutDialog'
import { AskpassDialog } from './components/dialog/AskpassDialog'
import { ShortcutsDialog } from './components/dialog/ShortcutsDialog'
import { CommandPalette } from './components/palette/CommandPalette'
import { SessionPalette } from './components/palette/SessionPalette'
import { Sidebar } from './components/sidebar/Sidebar'
import { TerminalWorkspace } from './components/terminal/TerminalWorkspace'
import { Toaster } from './components/toast/Toaster'
import { TopBar } from './components/topbar/TopBar'

function App() {
  return (
    <div className="grid grid-rows-[auto_1fr] h-screen bg-background">
      <AppBootstrap />
      <AppPersistence />
      <AppHotkeys />
      <TopBar />

      <div className="grid grid-cols-[auto_1fr] min-h-0">
        <Sidebar />
        <TerminalWorkspace />
      </div>

      <SessionPalette />
      <CommandPalette />
      <AskpassDialog />
      <AboutDialog />
      <ShortcutsDialog />
      <Toaster />
    </div>
  )
}

export default App
