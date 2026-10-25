import { describe, expect, it } from "vitest"
import { anchorWorld } from "@/core/assembly/mateSnap"
import { mateHolds } from "@/core/assembly/mateCheck"
import { createTestRig } from "@/core/scene/testRig"
import { length, sub } from "@/core/math/vec3"
import type { AnchorId, PartId } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

/** The test rig without its hinge, a pin anchor on each box, the leaf moved off. */
function setup() {
  const store = createDocumentStore()
  const rig = createTestRig()
  store.getState().insertEntities({ ...rig, mates: [] })
  const [base, leaf] = rig.parts.map((p) => p.id) as [PartId, PartId]
  const pin = (partId: PartId, originMm: [number, number, number]) => {
    const id = store.getState().addAnchor({
      partId,
      kind: "axial",
      frame: { originMm, z: [0, 0, 1], x: [1, 0, 0] },
      source: { kind: "manual" },
    })
    if (!id) throw new Error("anchor not added")
    return id
  }
  const a = pin(base, [60, 40, 0])
  const b = pin(leaf, [-30, -4, 0])
  store.getState().setPartPose(leaf, { positionMm: [300, 200, 100], quaternion: [0, 0.6, 0, 0.8] })
  store.temporal.getState().clear()
  return { store, base, leaf, a, b }
}
const entries = (store: ReturnType<typeof setup>["store"]) =>
  store.temporal.getState().pastStates.length
const gap = (store: ReturnType<typeof setup>["store"], a: AnchorId, b: AnchorId) => {
  const doc = store.getState().doc
  const [x, y] = [doc.anchors[a], doc.anchors[b]]
  const [px, py] = [x && doc.parts[x.partId], y && doc.parts[y.partId]]
  if (!x || !y || !px || !py) throw new Error("missing")
  return length(sub(anchorWorld(px, x).t, anchorWorld(py, y).t))
}

describe("mate actions", () => {
  it("adds a mate and snaps the free part onto it in one undo entry; undo puts it back", () => {
    const { store, leaf, a, b } = setup()
    const before = store.getState().doc.parts[leaf]?.pose
    const r = store
      .getState()
      .addMate({ anchorA: a, anchorB: b, type: "revolute", flip: false, angleOffsetRad: 0 })
    expect(r.ok).toBe(true)
    expect(gap(store, a, b)).toBeLessThan(1e-9)
    expect(entries(store)).toBe(1)
    store.temporal.getState().undo()
    expect(store.getState().doc.mates).toEqual({})
    expect(store.getState().doc.parts[leaf]?.pose).toEqual(before)
  })

  it("refuses both sides grounded, changing nothing", () => {
    const { store, leaf, a, b } = setup()
    store.getState().setPartsGrounded([leaf], true)
    const doc = store.getState().doc
    const r = store
      .getState()
      .addMate({ anchorA: a, anchorB: b, type: "fixed", flip: true, angleOffsetRad: 0 })
    expect(r).toEqual({ ok: false, reason: "grounded" })
    expect(store.getState().doc).toBe(doc)
  })

  it("an edit that changes where the mate puts B snaps again, in the same entry; others do not move", () => {
    const { store, leaf, a, b } = setup()
    const r = store
      .getState()
      .addMate({ anchorA: a, anchorB: b, type: "revolute", flip: false, angleOffsetRad: 0 })
    if (!r.ok) throw new Error(r.reason)
    const pose = () => store.getState().doc.parts[leaf]?.pose
    const snapped = pose()
    store.getState().updateMate(r.id, { limits: { min: -1, max: 1 }, contactsEnabled: true })
    expect(pose()).toBe(snapped) // nothing moved
    const steps = entries(store)
    store.getState().updateMate(r.id, { flip: true })
    expect(entries(store)).toBe(steps + 1)
    expect(pose()).not.toEqual(snapped)
    const mate = store.getState().doc.mates[r.id]
    expect(mate && mateHolds(store.getState().doc, mate)).toBe(true)
    store.getState().updateMate(r.id, { flip: true }) // the same again: no entry
    expect(entries(store)).toBe(steps + 1)
  })

  it("snaps again after the part was moved, and deletes", () => {
    const { store, leaf, a, b } = setup()
    const r = store
      .getState()
      .addMate({ anchorA: a, anchorB: b, type: "fixed", flip: true, angleOffsetRad: Math.PI })
    if (!r.ok) throw new Error(r.reason)
    store.getState().setPartPose(leaf, { positionMm: [1, 2, 3], quaternion: [0, 0, 0, 1] })
    expect(gap(store, a, b)).toBeGreaterThan(1)
    expect(store.getState().resnapMate(r.id)).toBeNull()
    expect(gap(store, a, b)).toBeLessThan(1e-9)
    store.getState().deleteMates([r.id])
    expect(store.getState().doc.mates).toEqual({})
  })
})

describe("mate limits (UI review)", () => {
  it("are dropped with a new type, in the same entry: radians are not millimetres", () => {
    const { store, a, b } = setup()
    const add = store.getState().addMate({
      anchorA: a,
      anchorB: b,
      type: "revolute",
      flip: false,
      angleOffsetRad: 0,
      limits: { min: -Math.PI / 2, max: Math.PI / 2 },
    })
    if (!add.ok) throw new Error(add.reason)
    store.temporal.getState().clear()
    store.getState().updateMate(add.id, { type: "prismatic" })
    expect(store.getState().doc.mates[add.id]?.limits).toBeUndefined()
    expect(entries(store)).toBe(1)
    store.temporal.getState().undo()
    expect(store.getState().doc.mates[add.id]?.limits).toEqual({
      min: -Math.PI / 2,
      max: Math.PI / 2,
    })
  })

  it("are added without -0 (it reads back as 0: scene.json is the contract)", () => {
    const { store, a, b } = setup()
    const add = store.getState().addMate({
      anchorA: a,
      anchorB: b,
      type: "revolute",
      flip: false,
      angleOffsetRad: 0,
      limits: { min: -0, max: 1 },
    })
    if (!add.ok) throw new Error(add.reason)
    expect(Object.is(store.getState().doc.mates[add.id]?.limits?.min, 0)).toBe(true)
  })
})
