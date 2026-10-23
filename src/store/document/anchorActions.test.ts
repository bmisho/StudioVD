import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { COLLECTION_CAPS, serializeScene, type AnchorId, type Frame } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

const FRAME: Frame = { originMm: [1, 2, 3], z: [0, 1, 0], x: [1, 0, 0] }

function setup() {
  const store = createDocumentStore()
  const rig = createTestRig()
  store.getState().insertEntities(rig)
  store.temporal.getState().clear()
  const [base, leaf] = rig.parts.map((p) => p.id)
  const hinge = rig.anchors[0]?.id
  if (!base || !leaf || !hinge) throw new Error("rig incomplete")
  const s = () => store.getState()
  const steps = () => store.temporal.getState().pastStates.length
  const anchor = (id: AnchorId) => s().doc.anchors[id]
  const add = (name?: string) => {
    const id = s().addAnchor({
      partId: base,
      kind: "planar",
      frame: FRAME,
      source: { kind: "manual" },
      name,
    })
    if (!id) throw new Error("not added")
    return id
  }
  return { store, s, base, leaf, hinge, steps, anchor, add }
}

describe("anchor actions", () => {
  it("adds an anchor to a part as one undo entry, its name trimmed", () => {
    const t = setup()
    const id = t.add("  Mount face ")
    expect(t.anchor(id)).toEqual({
      id,
      partId: t.base,
      kind: "planar",
      frame: FRAME,
      name: "Mount face",
      source: { kind: "manual" },
    })
    expect(t.steps()).toBe(1)
    expect(serializeScene(t.s().doc, "0.1.0").ok).toBe(true)
  })

  it("refuses anchors that would not validate, on missing parts, or past the file limit", () => {
    const t = setup()
    const doc = t.s().doc
    const input = { partId: t.base, kind: "point" as const, source: { kind: "manual" as const } }
    expect(t.s().addAnchor({ ...input, frame: { ...FRAME, z: [0, 2, 0] } })).toBeNull()
    expect(t.s().addAnchor({ ...input, frame: { ...FRAME, x: [0, 1, 0] } })).toBeNull()
    const gone = crypto.randomUUID() as typeof t.base
    expect(t.s().addAnchor({ ...input, partId: gone, frame: FRAME })).toBeNull()
    expect(t.s().doc).toBe(doc)
    t.store.setState((s) => {
      for (let i = Object.keys(s.doc.anchors).length; i < COLLECTION_CAPS.anchors; i++) {
        const id = crypto.randomUUID() as AnchorId
        s.doc.anchors[id] = { ...input, id, frame: FRAME }
      }
    })
    expect(t.s().addAnchor({ ...input, frame: FRAME })).toBeNull()
  })

  it("renames, tags, re-kinds and moves an anchor; empty texts clear; no change, no entry", () => {
    const t = setup()
    const id = t.add("Face")
    t.s().updateAnchor(id, { name: "Top", interface: " shaft-8mm ", kind: "axial" })
    expect(t.anchor(id)).toMatchObject({ name: "Top", interface: "shaft-8mm", kind: "axial" })
    t.s().updateAnchor(id, { frame: { ...FRAME, originMm: [4, -0, 6] } }) // "-0" typed
    expect(t.anchor(id)?.frame.originMm).toEqual([4, 0, 6])
    t.s().updateAnchor(id, { name: "", interface: null })
    expect(t.anchor(id)).not.toHaveProperty("name")
    expect(t.anchor(id)).not.toHaveProperty("interface")
    const before = t.steps()
    const doc = t.s().doc
    t.s().updateAnchor(id, { kind: "axial", name: null })
    t.s().updateAnchor(id, { frame: { ...FRAME, originMm: [4, 0, 6], z: [0, 0.5, 0] } }) // not unit
    expect([t.steps(), t.s().doc === doc]).toEqual([before, true])
  })

  it("turns an anchor over: z reversed, x kept", () => {
    const t = setup()
    const id = t.add()
    t.s().flipAnchor(id)
    expect(t.anchor(id)?.frame).toEqual({ ...FRAME, z: [0, -1, 0] }) // no -0: JSON drops it
    expect(serializeScene(t.s().doc, "0.1.0").ok).toBe(true)
  })

  it("deletes anchors with the mates on them, in one undo entry", () => {
    const t = setup()
    const mates = Object.keys(t.s().doc.mates)
    expect(mates).toHaveLength(1) // the rig's hinge, on both parts' hinge anchors
    t.s().deleteAnchors([t.hinge])
    expect(t.anchor(t.hinge)).toBeUndefined()
    expect(t.s().doc.mates).toEqual({})
    expect(Object.keys(t.s().doc.anchors)).toHaveLength(1) // the leaf's hinge anchor stays
    expect(t.steps()).toBe(1)
    expect(serializeScene(t.s().doc, "0.1.0").ok).toBe(true)
    const doc = t.s().doc
    t.s().deleteAnchors([t.hinge]) // already gone: nothing happens
    expect(t.s().doc).toBe(doc)
  })

  it("Edit › Delete on a mixed selection removes parts, groups and anchors as one entry", () => {
    const t = setup()
    const group = t.s().createGroup("Empty")
    t.store.temporal.getState().clear()
    const own = t.add("Own")
    t.s().deleteItems([t.leaf], [group], [own])
    expect(t.s().doc.parts[t.leaf]).toBeUndefined()
    expect(t.s().doc.groups[group]).toBeUndefined()
    expect(t.anchor(own)).toBeUndefined()
    expect(t.s().doc.mates).toEqual({}) // the hinge went with the leaf's anchor
    expect(t.steps()).toBe(2) // the add, then the delete
    expect(serializeScene(t.s().doc, "0.1.0").ok).toBe(true)
  })
})
