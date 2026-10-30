import { toastNotifier } from "@/lib/notify"
import { cancelInstall, commitInstall, listLibrary, pickPack } from "@/lib/tauri/library"
import { useLibraryStore } from "@/store/session/libraryStore"
import { createLibraryController } from "./libraryController"

/** The app's library controller, wired to the Rust library and the session store. */
export const libraryController = createLibraryController({
  backend: { listLibrary, pickPack, commitInstall, cancelInstall },
  store: useLibraryStore,
  notify: toastNotifier,
})
