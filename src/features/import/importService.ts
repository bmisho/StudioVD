import { viewportBridge } from "@/features/viewport/viewportBridge"
import {
  onFilesDropped,
  type ChosenFiles,
  pickImportFiles,
  readImportFile,
  readImportResource,
  writeAsset,
} from "@/lib/tauri/files"
import { ok, type Result } from "@/lib/tauri/result"
import { useDocumentStore } from "@/store/document/documentStore"
import { useImportStore } from "@/store/session/importStore"
import { useProjectStore } from "@/store/session/projectStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { toastNotifier as notify } from "@/lib/notify"
import { createImportController } from "./importController"
import { startImport } from "./importClient"
import { skippedMessage } from "@/core/import/skippedAdvice"

/** The app's import controller, wired to the real backend, stores and worker. */
export const importController = createImportController({
  backend: { readImportFile, readImportResource, writeAsset },
  runJob: startImport,
  document: useDocumentStore,
  session: useSessionStore,
  imports: useImportStore,
  fitAll: () => viewportBridge.fitAllAfterChange(),
  notify,
  projectBusy: () => useProjectStore.getState().busy !== null,
})

/** Opens the import dialog on picked or dropped files; reports the ones left out. */
function openChosen({ files, skipped }: ChosenFiles): boolean {
  if (skipped.length > 0) notify.warning("Some items cannot be imported", skippedMessage(skipped))
  if (files.length === 0) return false
  if (useImportStore.getState().status.phase === "running") {
    notify.info("An import is already running", "Try again when it has finished.")
    return false
  }
  if (useProjectStore.getState().busy !== null) {
    notify.info("The project is busy", "Import the files once it has finished.")
    return false
  }
  useImportStore.getState().open(files)
  return true
}

/**
 * File › Import…: the file dialog runs in Rust; the options dialog opens on the result.
 * Returns whether it opened (if not, the caller's focus-return target is stale).
 */
export async function chooseImportFiles(): Promise<Result<boolean>> {
  const picked = await pickImportFiles()
  return picked.ok ? ok(openChosen(picked.value)) : picked
}

/** Files dropped on the window open the same dialog. Returns the unsubscribe function. */
export function listenForDroppedFiles(): Promise<() => void> {
  return onFilesDropped((dropped) => void openChosen(dropped))
}
