import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
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

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full flex-col select-none">
        <AppMenuBar />
        <MainToolbar />
        <WorkspaceLayout />
        <StatusBar />
      </div>
      <AboutDialog />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
