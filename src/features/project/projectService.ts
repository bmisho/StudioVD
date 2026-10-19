import { APP_VERSION } from "@/core/app-info"
import { textureCache } from "@/features/viewport/materials/textureCache"
import { assetCache } from "@/features/viewport/parts/assetCache"
import { viewportBridge } from "@/features/viewport/viewportBridge"
import { toastNotifier } from "@/lib/notify"
import * as backend from "@/lib/tauri/project"
import { useDocumentStore } from "@/store/document/documentStore"
import { documentHistory } from "@/store/document/history"
import { useImportStore } from "@/store/session/importStore"
import { useProjectStore } from "@/store/session/projectStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { createAutosaver } from "./autosaver"
import { createDirtyTracker } from "./dirtyTracker"
import { createProjectController } from "./projectController"

/** The unsaved-changes flag, mirrored to Rust for the window title and the close guard. */
export const dirtyTracker = createDirtyTracker(useDocumentStore, useProjectStore, (dirty) => {
  void backend.setProjectDirty(dirty)
})

const autosaver = createAutosaver({
  document: useDocumentStore,
  history: documentHistory,
  project: useProjectStore,
  tracker: dirtyTracker,
  write: backend.writeAutosave,
  clear: backend.clearAutosave,
  appVersion: APP_VERSION,
  now: Date.now,
})

/** The app's project controller, wired to the real backend and stores. */
export const projectController = createProjectController({
  backend,
  document: useDocumentStore,
  history: documentHistory,
  session: useSessionStore,
  imports: useImportStore,
  project: useProjectStore,
  tracker: dirtyTracker,
  // After React has unmounted the old document's parts, so nothing draws freed buffers.
  retainAssets: (ids) =>
    setTimeout(() => {
      assetCache.retain(ids)
      textureCache.retain(ids)
    }, 0),
  fitAll: () => viewportBridge.fitAllAfterChange(),
  captureThumbnail: () => viewportBridge.captureThumbnail(),
  autosaveIdle: autosaver.idle,
  notify: toastNotifier,
  appVersion: APP_VERSION,
  now: Date.now,
})

/**
 * Startup (PLAN 5.4, 5.5): a `.stvd` the app was launched with opens first; then sessions
 * that crashed with unsaved changes are offered for recovery. Returns the unsubscribe for the
 * close and open-file events.
 */
export async function startProjectSession(): Promise<() => void> {
  const unlisten = await Promise.all([
    backend.onCloseRequested(() => void projectController.requestClose()),
    backend.onOpenRequested(() => void projectController.openLaunch()),
  ])
  const info = await backend.projectInfo()
  if (info.ok) useProjectStore.getState().setFileName(info.value.fileName)
  await projectController.openLaunch()
  const recovery = await backend.listRecovery()
  if (recovery.ok) useProjectStore.getState().setRecovery(recovery.value)
  return () => unlisten.forEach((fn) => fn())
}
