import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ImportDialog } from "@/features/import/ImportDialog"
import { useFileDrop } from "@/features/import/useFileDrop"
import { useCommands } from "./commands/commandsContext"
import { AboutDialog } from "./dialogs/AboutDialog"
import { WorkspaceLayout } from "./layout/WorkspaceLayout"
import { AppMenuBar } from "./menu/AppMenuBar"
import { useGlobalShortcuts } from "./shortcuts/useGlobalShortcuts"
import { StatusBar } from "./status/StatusBar"
import { MainToolbar } from "./toolbar/MainToolbar"

/** Application shell: menu bar, toolbar, workspace (sidebars + 3D/schematic), status bar. */
export function App() {
  useGlobalShortcuts(useCommands())
  useFileDrop()

  return (
    <TooltipProvider delayDuration={400}>
      {/* Chrome regions opt out of text selection; inspectors and messages stay selectable. */}
      <div className="flex h-full flex-col">
        <header className="shrink-0 select-none">
          <AppMenuBar />
          <MainToolbar />
        </header>
        <WorkspaceLayout />
        <StatusBar />
      </div>
      <AboutDialog />
      <ImportDialog />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
