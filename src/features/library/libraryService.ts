import { APP_VERSION } from "@/core/app-info"
import { toastNotifier } from "@/lib/notify"
import {
  addFromProject,
  cancelInstall,
  commitInstall,
  exportPack,
  listLibrary,
  pickPack,
  projectGeometrySizes,
  userNamespace,
} from "@/lib/tauri/library"
import { useDocumentStore } from "@/store/document/documentStore"
import { useLibraryStore } from "@/store/session/libraryStore"
import { createLibraryController } from "./libraryController"
import { createUserComponentController } from "./userComponentController"

/** The app's library controller, wired to the Rust library and the session store. */
export const libraryController = createLibraryController({
  backend: { listLibrary, pickPack, commitInstall, cancelInstall },
  store: useLibraryStore,
  notify: toastNotifier,
})

/** Save as component, Add to my library and Export pack (PLAN 9.7). */
export const userComponents = createUserComponentController({
  backend: { userNamespace, projectGeometrySizes, addFromProject, exportPack },
  document: useDocumentStore,
  library: useLibraryStore,
  notify: toastNotifier,
  appVersion: APP_VERSION,
  now: () => new Date(),
})
