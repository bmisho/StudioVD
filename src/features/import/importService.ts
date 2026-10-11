import { toast } from "sonner"
import { viewportBridge } from "@/features/viewport/viewportBridge"
import {
  onFilesDropped,
  pickImportFiles,
  readImportFile,
  readImportResource,
  writeAsset,
} from "@/lib/tauri/files"
import { ok, type Result } from "@/lib/tauri/result"
import { useDocumentStore } from "@/store/document/documentStore"
import { useImportStore } from "@/store/session/importStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { createImportController, type Notifier } from "./importController"
import { startImport } from "./importClient"

const notify: Notifier = {
  success: (title, detail) => toast.success(title, { description: detail }),
  info: (title, detail) => toast.info(title, { description: detail }),
  warning: (title, detail) => toast.warning(title, { description: detail }),
  error: (title, detail) => toast.error(title, { description: detail }),
}

/** The app's import controller, wired to the real backend, stores and worker. */
export const importController = createImportController({
  backend: { readImportFile, readImportResource, writeAsset },
  runJob: startImport,
  document: useDocumentStore,
  session: useSessionStore,
  imports: useImportStore,
  fitAll: () => viewportBridge.fitAllAfterChange(),
  notify,
})

/** File › Import…: the file dialog runs in Rust; the options dialog opens on the result. */
export async function chooseImportFiles(): Promise<Result<void>> {
  const picked = await pickImportFiles()
  if (!picked.ok) return picked
  useImportStore.getState().open(picked.value)
  return ok(undefined)
}

/** Files dropped on the window open the same dialog. Returns the unsubscribe function. */
export function listenForDroppedFiles(): Promise<() => void> {
  return onFilesDropped(({ files, skipped }) => {
    if (skipped.length > 0)
      notify.warning("Some dropped items cannot be imported", skipped.join("\n"))
    if (files.length === 0) return
    if (useImportStore.getState().status.phase === "running")
      notify.info("An import is already running", "Drop the files again when it has finished.")
    else useImportStore.getState().open(files)
  })
}
