import { toast } from "sonner"
import { exportScene } from "@/features/export/exportService"
import { chooseImportFiles } from "@/features/import/importService"
import { viewportBridge } from "@/features/viewport/viewportBridge"
import * as tauri from "@/lib/tauri/commands"
import type { AppError } from "@/lib/tauri/result"
import { closeMainWindow } from "@/lib/tauri/window"
import { useDocumentStore } from "@/store/document/documentStore"
import { documentHistory } from "@/store/document/history"
import { usePreferencesStore } from "@/store/preferences/preferencesStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { connectSelectionPruning } from "@/store/selectionSync"
import { rememberDialogReturnFocus } from "../dialogs/focusReturn"
import { createCommandRegistry } from "./registry"

function reportError(error: AppError, action: string): void {
  // "Arrives in Phase N" is expected while the app is being built, not an error.
  if (error.kind === "notImplemented" || error.kind === "unavailable") toast.info(error.message)
  else toast.error(`${action} failed`, { description: error.message })
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
    newProject: tauri.newProject,
    openProject: tauri.openProject,
    saveProject: tauri.saveProject,
    saveProjectAs: tauri.saveProjectAs,
    importFiles: () => {
      rememberDialogReturnFocus()
      return chooseImportFiles()
    },
    exportScene,
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
