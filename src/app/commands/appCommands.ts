import { toast } from "sonner"
import { exportScene } from "@/features/export/exportService"
import { exportSchematic } from "@/features/schematic/exportSchematic"
import { openExample } from "@/features/examples/openExample"
import { networkController } from "@/features/library/online/catalogService"
import { userComponents } from "@/features/library/libraryService"
import { chooseImportFiles } from "@/features/import/importService"
import { projectController } from "@/features/project/projectService"
import { viewportBridge } from "@/features/viewport/viewportBridge"
import { writeAsset } from "@/lib/tauri/files"
import { ok, type AppError } from "@/lib/tauri/result"
import { closeMainWindow } from "@/lib/tauri/window"
import { useDocumentStore } from "@/store/document/documentStore"
import { documentHistory } from "@/store/document/history"
import { usePreferencesStore } from "@/store/preferences/preferencesStore"
import { useLibraryStore } from "@/store/session/libraryStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { connectSelectionPruning } from "@/store/selectionSync"
import { forgetDialogReturnFocus, rememberDialogReturnFocus } from "../dialogs/focusReturn"
import { createCommandRegistry } from "./registry"

function reportError(error: AppError, action: string): void {
  // "Arrives in Phase N" is expected while the app is being built, not an error.
  if (error.kind === "notImplemented" || error.kind === "unavailable") toast.info(error.message)
  else toast.error(`${action} failed`, { description: error.message })
}

/**
 * A project operation from a command. It reports its own failures; a prompt it opens returns
 * focus to whatever invoked the command.
 */
const projectOp = (op: () => Promise<void>) => async () => {
  rememberDialogReturnFocus()
  try {
    await op()
  } finally {
    forgetDialogReturnFocus()
  }
  return ok(undefined)
}

function focusMenuBar(): void {
  document.querySelector<HTMLElement>('[role="menubar"] [role="menuitem"]')?.focus()
}

/** The app-wide command registry, wired to the real stores and backend. */
export const appCommands = createCommandRegistry({
  document: useDocumentStore,
  history: documentHistory,
  session: useSessionStore,
  preferences: usePreferencesStore,
  viewport: viewportBridge,
  backend: {
    newProject: projectOp(projectController.newProject),
    openProject: projectOp(projectController.open),
    saveProject: projectOp(projectController.save),
    saveProjectAs: projectOp(projectController.saveAs),
    closeProject: projectOp(projectController.newProject),
    importFiles: async () => {
      rememberDialogReturnFocus()
      const opened = await chooseImportFiles()
      if (!opened.ok || !opened.value) forgetDialogReturnFocus()
      return opened.ok ? ok(undefined) : opened
    },
    writeAsset,
    exportScene,
    exportSchematic,
    openExample,
    saveAsComponent: async (parts) => {
      rememberDialogReturnFocus()
      await userComponents.open(parts)
      if (useLibraryStore.getState().save.phase === "idle") forgetDialogReturnFocus()
      return ok(undefined)
    },
    openNetworkSettings: () => {
      rememberDialogReturnFocus()
      return networkController.open()
    },
    closeWindow: closeMainWindow,
  },
  reportError,
  focusMenuBar,
  openDialog: (dialog) => {
    rememberDialogReturnFocus()
    useSessionStore.getState().openDialog(dialog)
  },
})

// Undo/redo/delete can remove selected entities; keep the selection consistent.
connectSelectionPruning(useDocumentStore, useSessionStore)
