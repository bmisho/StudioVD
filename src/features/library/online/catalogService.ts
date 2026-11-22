import { toastNotifier } from "@/lib/notify"
import {
  cancelDownload,
  catalogStatus,
  downloadPack,
  libraryDiskUsage,
  refreshCatalog,
} from "@/lib/tauri/catalog"
import { commitInstall, removeComponent } from "@/lib/tauri/library"
import {
  clearExtraCa,
  networkSettings,
  pickExtraCa,
  saveNetworkSettings,
  testConnection,
} from "@/lib/tauri/network"
import { useCatalogStore } from "@/store/session/catalogStore"
import { useLibraryStore } from "@/store/session/libraryStore"
import { createCatalogController } from "./catalogController"
import { createNetworkController } from "./networkController"

/** The app's catalog controller, wired to Rust and the session stores. */
export const catalogController = createCatalogController({
  backend: {
    catalogStatus,
    refreshCatalog,
    downloadPack,
    cancelDownload,
    libraryDiskUsage,
    networkSettings,
    saveNetworkSettings,
    commitInstall,
    removeComponent,
  },
  catalog: useCatalogStore,
  library: useLibraryStore,
  notify: toastNotifier,
  runTest: () => networkController.test(),
})

/** Settings › Network. */
export const networkController = createNetworkController({
  backend: { networkSettings, saveNetworkSettings, pickExtraCa, clearExtraCa, testConnection },
  catalog: useCatalogStore,
  notify: toastNotifier,
  reload: () => catalogController.load(),
})
