import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { openSceneBytes, serializeScene } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

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
    const inner = s().groupItems([{ kind: "part", id: leaf }], "Inner")
    s().groupItems([{ kind: "group", id: inner }], "Middle")
    roundTrips("groups")
    s().renameGroup(outer, "Frame")
    s().renamePart(base, "Base plate")
    s().setPartsVisible([leaf], false)
    s().setPartsGrounded([leaf], true)
    s().setPartPose(leaf, { positionMm: [1, 2, 3], quaternion: [0, 0, 0.6, 0.8] })
    roundTrips("edits")
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
})
