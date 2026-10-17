// Test helper shared by the import controller tests (not app code).
import { vi } from "vitest"
import type { PreparedAsset } from "@/core/geometry/prepareAsset"
import type { AssetId } from "@/core/schema"
import { err, ok } from "@/lib/tauri/result"
import { createDocumentStore } from "@/store/document/documentStore"
import { createImportStore } from "@/store/session/importStore"
import { createSessionStore } from "@/store/session/sessionStore"
import { createImportController, type ImportDeps } from "./importController"
import type { ImportJob, ImportOutcome } from "./runImport"

export const prepared = (n: number, triangleCount = 12): PreparedAsset => ({
  name: `mesh${n}`,
  id: n.toString(16).padStart(64, "0") as AssetId,
  glb: new Uint8Array([n]),
  offsetMm: [n, 0, 0],
  triangleCount,
  bboxMm: { min: [-1, -1, -1], max: [1, 1, 1] },
  watertight: true,
  faceCount: 6,
})
export const outcome = (...ns: number[]): ImportOutcome => ({
  parts: ns.map((n) => ({ name: `Part ${n}`, path: [], asset: prepared(n) })),
  warnings: [],
})
export const file = (name: string) => ({ token: `t-${name}`, name, size: 10 })
export const bytes = (text: string) => new TextEncoder().encode(text).buffer

export function setupImport(jobs: Record<string, () => Promise<ImportOutcome>>) {
  const document = createDocumentStore()
  const session = createSessionStore()
  const imports = createImportStore()
  const seen: ImportJob[] = []
  const cancel = vi.fn()
  const deps: ImportDeps = {
    backend: {
      readImportFile: vi.fn((token: string) =>
        Promise.resolve(ok(bytes(token.endsWith(".obj") ? "mtllib parts.mtl\n" : "{}")))
      ),
      readImportResource: vi.fn((_token: string, relative: string) =>
        Promise.resolve(
          relative === "parts.mtl" ? ok(bytes("newmtl a\n")) : err({ kind: "io", message: "gone" })
        )
      ),
      writeAsset: vi.fn(() => Promise.resolve(ok(true))),
    },
    runJob: (job) => {
      seen.push(job)
      const run = jobs[job.fileName] ?? (() => Promise.reject(new Error("no job")))
      return { result: run(), cancel }
    },
    document,
    session,
    imports,
    fitAll: vi.fn(),
    notify: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
    projectBusy: vi.fn(() => false),
  }
  return {
    controller: createImportController(deps),
    deps,
    document,
    session,
    imports,
    seen,
    cancel,
  }
}
