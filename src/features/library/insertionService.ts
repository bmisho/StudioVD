import { viewportBridge } from "@/features/viewport/viewportBridge"
import { toastNotifier } from "@/lib/notify"
import { writeAsset } from "@/lib/tauri/files"
import { copyComponentIntoProject } from "@/lib/tauri/library"
import { useDocumentStore } from "@/store/document/documentStore"
import { useProjectStore } from "@/store/session/projectStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { requestBlock } from "@/features/schematic/blockRequest"
import { generateComponent } from "./generatorClient"
import { createInsertionController } from "./insertionController"
import { insertionPreview } from "./insertionPreview"

/** The app's insertion controller, wired to the generator worker, Rust and the stores. */
export const insertion = createInsertionController({
  backend: { generate: generateComponent, writeAsset, copyComponentIntoProject },
  document: useDocumentStore,
  session: useSessionStore,
  view: viewportBridge,
  preview: insertionPreview,
  notify: toastNotifier,
  projectBusy: () => useProjectStore.getState().busy !== null,
  addBlock: requestBlock,
})
