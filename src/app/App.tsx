import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ImportDialog } from "@/features/import/ImportDialog"
import { DragGhost } from "@/features/library/DragGhost"
import { CreditsDialog } from "@/features/library/CreditsDialog"
import { BlockEditorDialog } from "@/features/schematic/editor/BlockEditorDialog"
import { SimulationRunner } from "@/features/simulation/SimulationRunner"
import { BindingDialog } from "@/features/bindings/BindingDialog"
import { InstallPackDialog } from "@/features/library/InstallPackDialog"
import { SaveComponentDialog } from "@/features/library/SaveComponentDialog"
import { ConsentDialog } from "@/features/library/online/ConsentDialog"
import { NetworkSettingsDialog } from "@/features/library/online/NetworkSettingsDialog"
import { PacksDialog } from "@/features/library/online/PacksDialog"
import { useWeeklyCatalogCheck } from "@/features/library/online/useWeeklyCatalogCheck"
import { useFileDrop } from "@/features/import/useFileDrop"
import { RecoveryDialog } from "@/features/project/RecoveryDialog"
import { UnsavedChangesDialog } from "@/features/project/UnsavedChangesDialog"
import { useProjectSession } from "@/features/project/useProjectSession"
import { useCommands } from "./commands/commandsContext"
import { AboutDialog } from "./dialogs/AboutDialog"
import { ShortcutsDialog } from "./dialogs/ShortcutsDialog"
import { ContextMenuHost } from "./menu/ContextMenuHost"
import { WorkspaceLayout } from "./layout/WorkspaceLayout"
import { AppMenuBar } from "./menu/AppMenuBar"
import { useGlobalShortcuts } from "./shortcuts/useGlobalShortcuts"
import { StatusBar } from "./status/StatusBar"
import { MainToolbar } from "./toolbar/MainToolbar"

/** Application shell: menu bar, toolbar, workspace (sidebars + 3D/schematic), status bar. */
export function App() {
  useGlobalShortcuts(useCommands())
  useFileDrop()
  useProjectSession()
  useWeeklyCatalogCheck()

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
      <ShortcutsDialog />
      <ContextMenuHost />
      <ImportDialog />
      <CreditsDialog />
      <BlockEditorDialog />
      <SimulationRunner />
      <BindingDialog />
      <InstallPackDialog />
      <SaveComponentDialog />
      <PacksDialog />
      <NetworkSettingsDialog />
      <ConsentDialog />
      <DragGhost />
      <UnsavedChangesDialog />
      <RecoveryDialog />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
