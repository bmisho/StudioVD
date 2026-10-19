import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { openSceneBytes, serializeScene, type MaterialId, type TextureId } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

const TEXTURE = "ab".repeat(32) as TextureId
const texture = { id: TEXTURE, path: `textures/${TEXTURE}.png` }

function setup() {
  const store = createDocumentStore()
  const rig = createTestRig()
  const [slotted] = rig.assets
  if (!slotted) throw new Error("rig incomplete")
  slotted.slots = ["Body", "Trim"]
  store.getState().insertEntities(rig)
  store.temporal.getState().clear()
  const [base, leaf] = rig.parts.map((p) => p.id)
  if (!base || !leaf) throw new Error("rig incomplete")
  const onSlots = rig.parts.find((p) => p.assetId === slotted.id)?.id
  if (!onSlots) throw new Error("no part on the slotted asset")
  const s = () => store.getState()
  const undoSteps = () => store.temporal.getState().pastStates.length
  const roundTrips = (step: string) => {
    const saved = serializeScene(s().doc, "0.1.0")
    expect(saved.ok, step).toBe(true)
    if (!saved.ok) return
    const reopened = openSceneBytes(new TextEncoder().encode(saved.json), "0.1.0")
    expect(reopened.ok && reopened.document, step).toEqual({ ...s().doc, appVersion: "0.1.0" })
  }
  return { store, s, base, leaf, onSlots, undoSteps, roundTrips }
}

describe("material actions", () => {
  it("every action saves and reopens unchanged, each as one undo entry", () => {
    const t = setup()
    const steel = t.s().assignBuiltin([t.base, t.leaf], "std.steel")
    if (!steel) throw new Error("no steel")
    expect(t.s().assignBuiltin([t.leaf], "std.steel")).toBe(steel) // reused, not copied
    t.roundTrips("assign preset")
    const custom = t.s().createMaterial([t.leaf])
    if (!custom) throw new Error("no material")
    t.s().updateMaterial(custom, { name: "  Anodised ", color: "#123abc", roughness: 0.2 })
    expect(t.s().doc.materials[custom]?.name).toBe("Anodised")
    t.s().setMaterialMap(custom, "baseColor", { textureId: TEXTURE, tileSizeMm: 20 }, texture)
    t.roundTrips("custom with map")
    const copy = t.s().duplicateMaterial(custom, [t.base])
    t.s().setSlotMaterial(t.onSlots, "Trim", copy)
    t.roundTrips("copy and slot")
    expect(t.undoSteps()).toBe(6) // the repeated steel assignment changed nothing
    t.s().deleteMaterial(custom) // the copy keeps the texture
    expect(t.s().doc.textures[TEXTURE]).toEqual(texture)
    t.s().deleteMaterial(copy as MaterialId)
    expect(t.s().doc.textures).toEqual({})
    expect(t.s().doc.parts[t.onSlots]?.materialSlots).toBeUndefined()
    t.roundTrips("deletes")
    t.store.temporal.getState().undo()
    t.store.temporal.getState().undo()
    t.roundTrips("undo")
    expect(t.s().doc.parts[t.onSlots]?.materialSlots).toEqual([{ slot: "Trim", materialId: copy }])
  })

  it("ignores edits the schema would refuse, and edits that change nothing", () => {
    const t = setup()
    const id = t.s().createMaterial([t.base])
    if (!id) throw new Error("no material")
    const before = t.s().doc
    t.s().updateMaterial(id, { color: "#ABCDEF" })
    t.s().updateMaterial(id, { densityKgM3: 0 })
    t.s().updateMaterial(id, { name: "" })
    t.s().updateMaterial(id, { roughness: before.materials[id]?.roughness })
    t.s().assignMaterial([t.leaf], "00000000-0000-4000-8000-0000000000ff" as MaterialId)
    t.s().setSlotMaterial(t.onSlots, "Lens", id) // not a slot of this geometry
    t.s().setSlotMaterial(t.base === t.onSlots ? t.leaf : t.base, "Trim", id) // no slots
    t.s().setMaterialMap(id, "baseColor", { textureId: TEXTURE, tileSizeMm: 5 }) // unknown file
    expect(t.s().doc).toBe(before)
  })

  it("an edited preset copy is never reused for the next assignment", () => {
    const t = setup()
    const first = t.s().assignBuiltin([t.base], "std.brass")
    if (!first) throw new Error("no brass")
    t.s().updateMaterial(first, { roughness: 0.9 })
    const second = t.s().assignBuiltin([t.leaf], "std.brass")
    expect(second).not.toBe(first)
    expect(t.s().doc.materials[second as MaterialId]?.name).toBe("Brass 2")
    expect(t.s().assignBuiltin([t.leaf], "std.unobtainium")).toBeNull()
  })
})
