import { describe, expect, it, vi } from "vitest"
import { ok } from "@/lib/tauri/result"
import type { ImportOutcome } from "./runImport"
import { bytes, file, outcome, prepared, setupImport as setup } from "./importControllerTestSetup"

describe("import controller", () => {
  it("imports every file as ONE undo entry, selects it and stores each asset once", async () => {
    const t = setup({
      "a.stl": () => Promise.resolve(outcome(1)),
      "b.obj": () => Promise.resolve(outcome(2, 3)),
    })
    t.imports.getState().open([file("a.stl"), file("b.obj")])
    await t.controller.run()
    const { doc } = t.document.getState()
    expect(Object.values(doc.parts).map((p) => p.name)).toEqual(["Part 1", "Part 2", "Part 3"])
    expect(Object.values(doc.groups).map((g) => g.name)).toEqual(["b"])
    expect(t.document.temporal.getState().pastStates).toHaveLength(1)
    expect(t.session.getState().selection.map((s) => s.kind)).toEqual(["part", "group"])
    expect(t.deps.backend.writeAsset).toHaveBeenCalledTimes(3)
    expect(t.seen[1]?.mtlText).toBe("newmtl a\n")
    expect(t.deps.fitAll).toHaveBeenCalledOnce()
    expect(t.deps.notify.success).toHaveBeenCalledWith("Imported 3 parts from 2 files")
    expect(t.imports.getState().status.phase).toBe("idle")
  })

  it("reports a failed file and still imports the others", async () => {
    const t = setup({
      "ok.stl": () => Promise.resolve(outcome(1)),
      "bad.stl": () => Promise.reject(new Error("corrupt")),
    })
    t.imports.getState().open([file("bad.stl"), file("ok.stl"), file("notes.txt")])
    await t.controller.run()
    expect(Object.keys(t.document.getState().doc.parts)).toHaveLength(1)
    expect(t.deps.notify.error).toHaveBeenCalledWith(
      "Some files could not be imported",
      "bad.stl: corrupt\nnotes.txt: This file type cannot be imported."
    )
  })

  it("cancelling inserts nothing", async () => {
    let fail: (e: Error) => void = () => undefined
    const t = setup({ "big.step": () => new Promise((_, reject) => (fail = reject)) })
    t.cancel.mockImplementation(() => fail(new DOMException("Import cancelled.", "AbortError")))
    t.imports.getState().open([file("big.step")])
    const running = t.controller.run()
    await vi.waitFor(() => expect(t.seen).toHaveLength(1))
    expect(t.imports.getState().status.phase).toBe("running")
    t.controller.cancel()
    await running
    expect(t.document.getState().doc.parts).toEqual({})
    expect(t.document.temporal.getState().pastStates).toHaveLength(0)
    expect(t.deps.notify.info).toHaveBeenCalledWith("Import cancelled", "Nothing was added.")
    expect(t.deps.notify.error).not.toHaveBeenCalled()
  })

  it("warns when the scene goes over the triangle budget", async () => {
    const huge: ImportOutcome = {
      parts: [{ name: "Huge", path: [], asset: prepared(1, 3_000_000) }],
      warnings: [],
    }
    const t = setup({ "huge.stl": () => Promise.resolve(huge) })
    t.imports.getState().open([file("huge.stl")])
    await t.controller.run()
    expect(t.deps.notify.warning).toHaveBeenCalledWith(
      "Import warnings",
      expect.stringMatching(/^The scene now has 3\.0 M triangles/)
    )
  })

  it("a missing material library is a warning; a missing glTF buffer fails that file", async () => {
    const t = setup({
      "m.obj": () => Promise.resolve(outcome(1)),
      "s.gltf": () => Promise.resolve(outcome(2)),
    })
    vi.mocked(t.deps.backend.readImportFile).mockImplementation((token: string) =>
      Promise.resolve(
        ok(bytes(token.endsWith(".obj") ? "mtllib lost.mtl\n" : '{"buffers":[{"uri":"s.bin"}]}'))
      )
    )
    t.imports.getState().open([file("m.obj"), file("s.gltf")])
    await t.controller.run()
    expect(Object.keys(t.document.getState().doc.parts)).toHaveLength(1)
    expect(t.deps.notify.warning).toHaveBeenCalledWith(
      "Import warnings",
      "m.obj: material library lost.mtl not found, colours skipped."
    )
    expect(t.deps.notify.error).toHaveBeenCalledWith(
      "Some files could not be imported",
      "s.gltf: gone"
    )
  })
})
