import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { SelectionRef } from "@/core/scene/selection"
import { openSceneBytes, SCENE_LIMITS, serializeScene, type GroupId } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

type Store = ReturnType<typeof createDocumentStore>
const group = (store: Store, items: SelectionRef[], name: string): GroupId => {
  const id = store.getState().groupItems(items, name)
  if (!id) throw new Error(`${name} was not created`)
  return id
}

/**
 * scene.json is the contract (PLAN 5.1): after every store action the document must save,
 * and what is saved must open again as the same document.
 */
describe("document store contract", () => {
  it("every action leaves a document that saves and reopens unchanged", () => {
    const store = createDocumentStore()
    const s = () => store.getState()
    const roundTrips = (step: string) => {
      const saved = serializeScene(s().doc, "0.1.0")
      expect(saved.ok, step).toBe(true)
      if (!saved.ok) return
      const reopened = openSceneBytes(new TextEncoder().encode(saved.json), "0.1.0")
      expect(reopened.ok && reopened.document, step).toEqual({ ...s().doc, appVersion: "0.1.0" })
    }

    const rig = createTestRig()
    s().insertEntities(rig)
    roundTrips("insert rig")
    const [base, leaf] = rig.parts.map((p) => p.id)
    if (!base || !leaf) throw new Error("rig incomplete")
    const outer = s().createGroup("Outer")
    const inner = group(store, [{ kind: "part", id: leaf }], "Inner")
    group(store, [{ kind: "group", id: inner }], "Middle")
    roundTrips("groups")
    s().renameGroup(outer, "Frame")
    s().renamePart(base, "Base plate")
    s().setPartsVisible([leaf], false)
    s().setPartsGrounded([leaf], true)
    s().setPartPose(leaf, { positionMm: [1, 2, 3], quaternion: [0, 0, 0.6, 0.8] })
    roundTrips("edits")
    const frame = { originMm: [0, 40, 30] as const, z: [0, 0, 1] as const, x: [1, 0, 0] as const }
    const anchor = s().addAnchor({
      partId: base,
      kind: "planar",
      frame: { originMm: [...frame.originMm], z: [...frame.z], x: [...frame.x] },
      source: { kind: "face", faceIndex: 2 },
      name: "Front",
    })
    if (!anchor) throw new Error("anchor not added")
    s().updateAnchor(anchor, { name: "Front face", interface: "M3-hole", kind: "axial" })
    s().flipAnchor(anchor)
    roundTrips("anchors")
    s().deleteAnchors([rig.anchors[0]?.id ?? anchor])
    roundTrips("delete anchor with its mate")
    s().deleteGroups([inner])
    roundTrips("delete group")
    s().deleteItems([base], [outer])
    roundTrips("delete mixed")
    store.temporal.getState().undo()
    store.temporal.getState().undo()
    roundTrips("undo")
    s().insertEntities(createTestRig()) // a second rig shares the content-addressed assets
    roundTrips("second rig")
  })

  it("New Group stops at the deepest nesting a file may hold", () => {
    const store = createDocumentStore()
    const rig = createTestRig()
    store.getState().insertEntities(rig)
    const leaf = rig.parts[0]?.id
    if (!leaf) throw new Error("rig incomplete")
    let top = group(store, [{ kind: "part", id: leaf }], "G")
    let depth = 1
    for (; depth < 100; depth++) {
      const next = store.getState().groupItems([{ kind: "group", id: top }], "G") // Ctrl+G
      if (!next) break
      top = next
    }
    expect(depth).toBe(SCENE_LIMITS.maxGroupDepth)
    const before = store.getState().doc
    expect(store.getState().groupItems([{ kind: "part", id: leaf }], "Below")).toBeNull()
    expect(store.getState().doc).toBe(before)
    const deepest = store.getState().doc.parts[leaf]?.parentId ?? null
    expect(() => store.getState().createGroup("Below", deepest)).toThrow()
    expect(serializeScene(store.getState().doc, "0.1.0").ok).toBe(true)
  })
})
