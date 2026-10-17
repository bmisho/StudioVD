import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { PartId } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

function rigStore() {
  const store = createDocumentStore()
  const rig = createTestRig()
  store.getState().insertEntities(rig)
  store.temporal.getState().clear()
  const [base, leaf] = rig.parts
  if (!base || !leaf) throw new Error("rig incomplete")
  return { store, base: base.id, leaf: leaf.id }
}

describe("part actions", () => {
  it("deleting a part removes its anchors and mates in ONE undo entry", () => {
    const { store, leaf } = rigStore()
    store.getState().deleteParts([leaf])
    const { doc } = store.getState()
    expect(Object.keys(doc.parts)).toHaveLength(1)
    expect(Object.keys(doc.anchors)).toHaveLength(1)
    expect(doc.mates).toEqual({})
    expect(Object.keys(doc.assets)).toHaveLength(1)
    expect(store.temporal.getState().pastStates).toHaveLength(1)
    store.temporal.getState().undo()
    expect(Object.keys(store.getState().doc.mates)).toHaveLength(1)
  })

  it("visibility, grounding and renames change only what differs", () => {
    const { store, base, leaf } = rigStore()
    store.getState().setPartsGrounded([base], true) // already grounded: no entry
    store.getState().renamePart(base, "   ") // rejected by NameSchema
    expect(store.temporal.getState().pastStates).toHaveLength(0)
    store.getState().setPartsVisible([base, leaf, "gone" as PartId], false)
    store.getState().renamePart(leaf, "  Lid  ")
    const { parts } = store.getState().doc
    expect([parts[base]?.visible, parts[leaf]?.visible, parts[leaf]?.name]).toEqual([
      false,
      false,
      "Lid",
    ])
  })

  it("groups parts under their shared parent and ignores invalid poses", () => {
    const { store, base, leaf } = rigStore()
    const outer = store.getState().groupItems([], "Outer")
    const inner = store.getState().groupItems(
      [
        { kind: "part", id: base },
        { kind: "part", id: leaf },
      ],
      "Inner"
    )
    if (!outer || !inner) throw new Error("not grouped")
    const { doc } = store.getState()
    expect(doc.groups[outer]?.parentId).toBeNull()
    expect(doc.groups[inner]?.parentId).toBeNull()
    expect(doc.parts[base]?.parentId).toBe(inner)
    const before = store.getState().doc
    store.getState().setPartPose(base, { positionMm: [1, 2, 3], quaternion: [0, 0, 0, 2] })
    expect(store.getState().doc).toBe(before)
    store.getState().setPartPose(base, { positionMm: [1e9, 0, 0], quaternion: [0, 0, 0, 1] })
    expect(store.getState().doc).toBe(before) // beyond what a file may hold
    store.getState().setPartPose(base, { positionMm: [1, 2, 3], quaternion: [0, 0, 0, 1] })
    expect(store.getState().doc.parts[base]?.pose.positionMm).toEqual([1, 2, 3])
  })
})
