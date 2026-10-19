import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { COLLECTION_CAPS, serializeScene, type MaterialId, type PartId } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

function setup() {
  const store = createDocumentStore()
  const rig = createTestRig()
  store.getState().insertEntities(rig)
  const [a, b] = rig.parts.map((p) => p.id)
  if (!a || !b) throw new Error("rig incomplete")
  const s = () => store.getState()
  const materialOf = (id: PartId) => s().doc.parts[id]?.materialId
  return { store, s, a, b, materialOf }
}

describe("material actions: reuse and limits", () => {
  it("never hands out a renamed copy or a Make unique copy as the preset", () => {
    const t = setup()
    const steel = t.s().assignBuiltin([t.a, t.b], "std.steel")
    if (!steel) throw new Error("no steel")
    const own = t.s().duplicateMaterial(steel, [t.b]) // B's own copy, values still the preset's
    t.s().updateMaterial(steel, { name: "Shaft steel" })
    const fresh = t.s().assignBuiltin([t.a], "std.steel")
    expect([fresh === steel, fresh === own]).toEqual([false, false])
    expect(t.s().doc.materials[fresh as MaterialId]?.name).toBe("Steel")
  })

  it("re-applying the preset parts already show changes nothing (no undo entry)", () => {
    const t = setup()
    const steel = t.s().assignBuiltin([t.a, t.b], "std.steel")
    const doc = t.s().doc
    expect(t.s().assignBuiltin([t.a, t.b], "std.steel")).toBe(steel)
    expect(t.s().doc).toBe(doc)
  })

  it("numbers a copy of a 120-character name within the name limit", () => {
    const t = setup()
    const id = t.s().createMaterial([t.a])
    if (!id) throw new Error("no material")
    t.s().updateMaterial(id, { name: "x".repeat(120) })
    const copy = t.s().duplicateMaterial(id, [t.b])
    expect(t.s().doc.materials[copy as MaterialId]?.name).toBe(`${"x".repeat(118)} 2`)
    expect(serializeScene(t.s().doc, "0.1.0").ok).toBe(true)
  })

  it(`stops at ${COLLECTION_CAPS.materials} materials, as a file may hold`, () => {
    const t = setup()
    for (let i = 0; i < COLLECTION_CAPS.materials; i++) t.s().createMaterial()
    expect(t.s().createMaterial([t.a])).toBeNull()
    expect(t.materialOf(t.a)).toBeNull()
    expect(serializeScene(t.s().doc, "0.1.0").ok).toBe(true)
  })
})
