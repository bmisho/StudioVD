/// <reference lib="webworker" />
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"
import occtWasmUrl from "occt-import-js/dist/occt-import-js.wasm?url"
import { runImport } from "@/features/import/runImport"
import type { ImportMessage, ImportRequest } from "./importProtocol"

// Import worker (CLAUDE.md §6: STEP/IGES parsing and mesh processing off the main thread).
// occt-import-js is LGPL-2.1: its JS glue is a separate chunk (dynamic import) and its WASM a
// separate, unmodified file located through `locateFile` (PLAN §5), never inlined.

const scope = self as unknown as DedicatedWorkerGlobalScope
const post = (message: ImportMessage, transfer: Transferable[] = []) =>
  scope.postMessage(message, transfer)

const decoders = {
  occt: () => import("occt-import-js").then((m) => m.default({ locateFile: () => occtWasmUrl })),
  // Bundled decoder files in public/draco (no CDN, CLAUDE.md §6).
  draco: () => new DRACOLoader().setDecoderPath(new URL("/draco/", scope.location.origin).href),
  meshopt: MeshoptDecoder,
}

scope.onmessage = async (event: MessageEvent<ImportRequest>) => {
  try {
    const outcome = await runImport(event.data.job, decoders, (done, total, stage) =>
      post({ type: "progress", done, total, stage })
    )
    post(
      { type: "done", outcome },
      outcome.parts.map((p) => p.asset.glb.buffer as ArrayBuffer)
    )
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) })
  }
}
