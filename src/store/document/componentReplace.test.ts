import { describe, expect, it } from "vitest"
import { instantiateComponent } from "@/core/library/instantiate"
import { at, generated } from "@/core/library/testing/generatedComponent"
import { compose, fromPose, invert, toPose } from "@/core/math/rigid"
import { checkIntegrity, openSceneBytes, serializeScene, type PartId } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

type Store = ReturnType<typeof createDocumentStore>

function roundTrips(store: Store) {
  const doc = store.getState().doc
  expect(checkIntegrity(doc)).toEqual([])
  const saved = serializeScene(doc, "0.1.0")
  if (!saved.ok) throw new Error("not saved")
  const reopened = openSceneBytes(new TextEncoder().encode(saved.json), "0.1.0")
  expect(reopened.ok && reopened.document).toEqual({ ...doc, appVersion: "0.1.0" })
}

/** A screw (the component under test) mated into the top of a plate. */
async function screwOnPlate() {
  const store = createDocumentStore()
  const s = () => store.getState()
  const screw = await generated("fastener.screw", { size: "M3", lengthMm: 10, head: "socket" })
  const placed = instantiateComponent(s().doc, { ...screw, pose: at(5, 0, 0) })
  s().insertEntities(placed.batch)
  const plate = await generated("primitive.box", { widthMm: 30, heightMm: 5, depthMm: 30 })
  const base = instantiateComponent(s().doc, { ...plate, pose: at(0, -20, 0) })
  s().insertEntities(base.batch)
  const seat = s().doc.components[placed.instance]?.anchors.seat
  const top = s().doc.components[base.instance]?.anchors.top
  if (!seat || !top) throw new Error("anchors missing")
  const mate = s().addMate({
    anchorA: top,
    anchorB: seat,
    type: "fixed",
    flip: true,
    angleOffsetRad: 0,
  })
  if (!mate.ok) throw new Error(mate.reason)
  return { store, s, instance: placed.instance, group: placed.group, mate: mate.id }
}

describe("component updates (PLAN 14.6)", () => {
  it("Update keeps ids by key and adds the new version's licence texts", async () => {
    const { store, s, instance, mate } = await screwOnPlate()
    const longer = await generated("fastener.screw", { size: "M3", lengthMm: 16, head: "socket" })
    const sha = "ab".repeat(32)
    const before = s().doc.components[instance]
    const undoBefore = store.temporal.getState().pastStates.length
    s().regenerateComponent(instance, longer.def, longer.assets, [
      { sha256: sha, text: { path: `licenses/${sha}.txt`, spdx: "MIT" } },
    ])
    expect(store.temporal.getState().pastStates.length).toBe(undoBefore + 1)
    expect(s().doc.components[instance]?.anchors).toEqual(before?.anchors)
    expect(Object.hasOwn(s().doc.mates, mate)).toBe(true)
    expect(Object.hasOwn(s().doc.licenseTexts, sha)).toBe(true)
  })

  it("Replace places the new version in the same frame, dropping what hung on the old one", async () => {
    const { store, s, instance, group, mate } = await screwOnPlate()
    const c = s().doc.components[instance]
    const oldDef = c?.def ? s().doc.componentDefs[c.def]?.manifest : undefined
    const oldRoot = s().doc.parts[c?.parts.screw as PartId]
    const screwAt = oldDef?.parts.screw?.transform
    if (!oldRoot || !screwAt) throw new Error("no screw")
    const frame = compose(fromPose(oldRoot.pose), invert(fromPose(screwAt)))
    const washer = await generated("fastener.washer", { size: "M3" })
    const washerRoot = washer.def.manifest.rootPart
    const washerAt = washer.def.manifest.parts[washerRoot]?.transform
    if (!washerAt) throw new Error("no washer root")
    const expected = toPose(compose(frame, fromPose(washerAt))).positionMm
    const undoBefore = store.temporal.getState().pastStates.length
    const added = s().replaceComponent(instance, washer.def, washer.assets, [])
    roundTrips(store)
    expect(store.temporal.getState().pastStates.length).toBe(undoBefore + 1)
    expect(Object.hasOwn(s().doc.components, instance)).toBe(false)
    expect(Object.hasOwn(s().doc.groups, group)).toBe(false)
    expect(Object.hasOwn(s().doc.mates, mate)).toBe(false) // the outside mate went with it
    const fresh = Object.values(s().doc.components).find((c) => c.groupId === added)
    const root = fresh && s().doc.parts[fresh.parts[washerRoot] as PartId]
    expect(root).toBeDefined()
    root?.pose.positionMm.forEach((v, i) => expect(v).toBeCloseTo(expected[i] ?? NaN, 9))
    expect(fresh?.designator).toBeDefined()
    store.temporal.getState().undo()
    expect(Object.hasOwn(s().doc.components, instance)).toBe(true)
    expect(Object.hasOwn(s().doc.mates, mate)).toBe(true)
  })
})
