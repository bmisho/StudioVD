import { describe, expect, it, vi } from "vitest"
import { ok, type Result } from "@/lib/tauri/result"
import type { PartId } from "@/core/schema"
import type { ImportOutcome } from "./runImport"
import { bytes, file, outcome, prepared, setupImport } from "./importControllerTestSetup"

describe("import controller: edges", () => {
  it("a Cancel while the file is still being read stops before any worker starts", async () => {
    const t = setupImport({ "a.stl": () => Promise.resolve(outcome(1)) })
    let release: (r: Result<ArrayBuffer>) => void = () => undefined
    vi.mocked(t.deps.backend.readImportFile).mockImplementation(
      () => new Promise((resolve) => (release = resolve))
    )
    t.imports.getState().open([file("a.stl")])
    const running = t.controller.run()
    await vi.waitFor(() => expect(t.deps.backend.readImportFile).toHaveBeenCalled())
    t.controller.cancel()
    release(ok(bytes("solid")))
    await running
    expect(t.seen).toEqual([]) // no worker
    expect(t.document.getState().doc.parts).toEqual({})
    expect(t.deps.notify.info).toHaveBeenCalledWith("Import cancelled", "Nothing was added.")
    expect(t.imports.getState().status.phase).toBe("idle")
  })

  it("stores an asset shared by several parts and files once", async () => {
    const same: ImportOutcome = {
      parts: [
        { name: "Screw", path: [], asset: prepared(7) },
        { name: "Screw", path: [], asset: prepared(7) },
      ],
      warnings: [],
    }
    const t = setupImport({
      "a.stl": () => Promise.resolve(same),
      "b.stl": () => Promise.resolve(same),
    })
    t.imports.getState().open([file("a.stl"), file("b.stl")])
    await t.controller.run()
    expect(t.deps.backend.writeAsset).toHaveBeenCalledTimes(1)
    expect(Object.keys(t.document.getState().doc.parts)).toHaveLength(4)
  })

  it("leaves View › Isolate so the imported parts are drawn", async () => {
    const t = setupImport({ "a.stl": () => Promise.resolve(outcome(1)) })
    t.session.getState().toggleIsolation(["p" as PartId])
    t.imports.getState().open([file("a.stl")])
    await t.controller.run()
    expect(t.session.getState().isolated).toBeNull()
  })

  it("does not start while a project operation may replace the workspace", async () => {
    const t = setupImport({ "a.stl": () => Promise.resolve(outcome(1)) })
    vi.mocked(t.deps.projectBusy).mockReturnValue(true)
    t.imports.getState().open([file("a.stl")])
    await t.controller.run()
    expect(t.deps.backend.readImportFile).not.toHaveBeenCalled()
    expect(t.deps.backend.writeAsset).not.toHaveBeenCalled()
    expect(t.imports.getState().status.phase).toBe("options") // Import works again after it
    expect(t.deps.notify.info).toHaveBeenCalledWith("The project is busy", expect.any(String))
  })
})
