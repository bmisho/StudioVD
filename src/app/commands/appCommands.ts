import { toast } from "sonner"
import * as tauri from "@/lib/tauri/commands"
import type { AppError } from "@/lib/tauri/result"
import { closeMainWindow } from "@/lib/tauri/window"
import { useDocumentStore } from "@/store/document/documentStore"
import { documentHistory } from "@/store/document/history"
import { useSessionStore } from "@/store/session/sessionStore"
import { createCommandRegistry } from "./registry"

function reportError(error: AppError): void {
  // "Arrives in Phase N" is expected while the app is being built, not an error.
  if (error.kind === "notImplemented" || error.kind === "unavailable") toast.info(error.message)
  else toast.error(error.message)
}

/** The app-wide command registry, wired to the real stores and backend. */
export const appCommands = createCommandRegistry({
  document: useDocumentStore,
  history: documentHistory,
  session: useSessionStore,
  backend: {
    newProject: tauri.newProject,
    openProject: tauri.openProject,
    saveProject: tauri.saveProject,
    saveProjectAs: tauri.saveProjectAs,
    importFiles: tauri.importFiles,
    exportScene: tauri.exportScene,
    closeWindow: closeMainWindow,
  },
  reportError,
  openDialog: (dialog) => useSessionStore.getState().openDialog(dialog),
})
