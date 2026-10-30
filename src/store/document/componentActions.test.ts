import { describe, expect, it } from "vitest"
import { instantiateComponent } from "@/core/library/instantiate"
import { at, generated } from "@/core/library/testing/generatedComponent"
import { checkIntegrity, openSceneBytes, serializeScene, type PartId } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

type Store = ReturnType<typeof createDocumentStore>

/** scene.json is the contract: the document saves and reopens unchanged (PLAN 5.1). */
function roundTrips(store: Store, step: string) {
  const doc = store.getState().doc
  expect(checkIntegrity(doc), step).toEqual([])
  const saved = serializeScene(doc, "0.1.0")
  expect(saved.ok, step).toBe(true)
  if (!saved.ok) return
  const reopened = openSceneBytes(new TextEncoder().encode(saved.json), "0.1.0")
  expect(reopened.ok && reopened.document, step).toEqual({ ...doc, appVersion: "0.1.0" })
}

async function withComponent(id: string, params: Record<string, string | number | boolean>) {
  const store = createDocumentStore()
  const ready = await generated(id, params)
  const placed = instantiateComponent(store.getState().doc, { ...ready, pose: at(0, 0, 0) })
  store.getState().insertEntities(placed.batch)
  return { store, ...placed, ready }
}

describe("component actions", () => {
  it("inserts a component as one undo entry that saves and reopens (regression: -0 in frames)", async () => {
    const { store, instance } = await withComponent("bearing.deepGroove", {
      boreMm: 8,
      outerMm: 22,
      widthMm: 7,
      seal: "ZZ",
    })
    roundTrips(store, "insert")
    expect(store.temporal.getState().pastStates).toHaveLength(1)
    store.temporal.getState().undo()
    expect(store.getState().doc.components).toEqual({})
    store.temporal.getState().redo()
    expect(Object.keys(store.getState().doc.components)).toEqual([instance])
  })

  it("keeps instances true when their entities go", async () => {
    const { store, instance, group } = await withComponent("bearing.deepGroove", {
      boreMm: 8,
      outerMm: 22,
      widthMm: 7,
      seal: "2RS",
    })
    const s = () => store.getState()
    const record = () => s().doc.components[instance]
    const inner = record()?.parts.inner as PartId
    s().deleteParts([inner])
    roundTrips(store, "delete a part")
    expect(Object.keys(record()?.parts ?? {})).toEqual(["outer"])
    expect(record()?.mates).toEqual({}) // the internal mate went with the inner ring
    const rubber = record()?.materials.rubber
    if (!rubber) throw new Error("no rubber")
    s().deleteMaterial(rubber)
    roundTrips(store, "delete a material")
    expect(record()?.materials.rubber).toBeUndefined()
    // Deleting the component's group deletes the whole component.
    s().deleteItems([], [group])
    roundTrips(store, "delete the component")
    expect(s().doc.components).toEqual({})
    expect(s().doc.parts).toEqual({})
  })

  it("drops the instance when its last part goes, and unlinks when only its group goes", async () => {
    const { store, instance, group } = await withComponent("fastener.washer", { size: "M3" })
    const s = () => store.getState()
    s().deleteGroups([group])
    roundTrips(store, "group deleted")
    expect(s().doc.components).toEqual({})
    const part = Object.values(s().doc.parts)[0]
    expect(part?.componentRef).toBeUndefined()
    expect(Object.values(s().doc.anchors).every((a) => a.source.kind === "manual")).toBe(true)
    store.temporal.getState().undo()
    expect(Object.keys(s().doc.components)).toEqual([instance])
    s().deleteParts([Object.values(s().doc.parts)[0]?.id as PartId])
    roundTrips(store, "last part deleted")
    expect(s().doc.components).toEqual({})
    expect(Object.hasOwn(s().doc.groups, group)).toBe(true)
  })

  it("unlinks into plain parts in the same group, in one undo entry", async () => {
    const { store, instance, group } = await withComponent("bearing.deepGroove", {
      boreMm: 5,
      outerMm: 16,
      widthMm: 5,
      seal: "ZZ",
    })
    const s = () => store.getState()
    s().unlinkComponent(instance)
    roundTrips(store, "unlink")
    expect(s().doc.components).toEqual({})
    expect(Object.values(s().doc.parts).every((p) => !p.componentRef && p.parentId === group)).toBe(
      true
    )
    expect(Object.keys(s().doc.mates)).toHaveLength(1) // the mate stays, as a plain mate
    store.temporal.getState().undo()
    expect(Object.keys(s().doc.components)).toEqual([instance])
  })

  it("regenerates with new parameters, keeping anchor ids so outside mates survive", async () => {
    const { store, instance } = await withComponent("fastener.screw", {
      size: "M3",
      lengthMm: 10,
      head: "socket",
    })
    const s = () => store.getState()
    // A plate (another component) with the screw mated into its top.
    const plate = await generated("primitive.box", { widthMm: 30, heightMm: 5, depthMm: 30 })
    const placed = instantiateComponent(s().doc, { ...plate, pose: at(0, -20, 0) })
    s().insertEntities(placed.batch)
    const seat = s().doc.components[instance]?.anchors.seat
    const top = s().doc.components[placed.instance]?.anchors.top
    if (!seat || !top) throw new Error("anchors missing")
    const mate = s().addMate({
      anchorA: top,
      anchorB: seat,
      type: "fixed",
      flip: true,
      angleOffsetRad: 0,
    })
    if (!mate.ok) throw new Error(mate.reason)
    const before = s().doc.components[instance]
    const longer = await generated("fastener.screw", { size: "M3", lengthMm: 16, head: "socket" })
    s().regenerateComponent(instance, longer.def, longer.assets)
    roundTrips(store, "regenerate")
    const after = s().doc.components[instance]
    expect(after?.def).toBe(longer.def.key)
    expect(after?.anchors).toEqual(before?.anchors)
    expect(after?.parts).toEqual(before?.parts)
    expect(Object.hasOwn(s().doc.mates, mate.id)).toBe(true)
    const screw = s().doc.parts[after?.parts.screw as PartId]
    expect(screw?.assetId).toBe(longer.assets.screw?.id)
    // The seat (under the head) stays where it was: the component frame did not move.
    const seatAnchor = s().doc.anchors[seat]
    expect(seatAnchor?.frame.originMm[1]).not.toBe(
      before && s().doc.anchors[seat]?.frame.originMm[1] === undefined
    )
    store.temporal.getState().undo()
    expect(s().doc.components[instance]?.def).toBe(before?.def)
  })

  it("leaves parts the user deleted deleted when regenerating", async () => {
    const box = {
      widthMm: 60,
      depthMm: 40,
      heightMm: 25,
      wallMm: 2,
      floorMm: 2,
      cornerRadiusMm: 3,
      lid: true,
      material: "pla",
    }
    const { store, instance } = await withComponent("enclosure.box", box)
    const s = () => store.getState()
    s().deleteParts([s().doc.components[instance]?.parts.lid as PartId])
    const bigger = await generated("enclosure.box", { ...box, widthMm: 80 })
    s().regenerateComponent(instance, bigger.def, bigger.assets)
    roundTrips(store, "regenerate without the lid")
    expect(Object.keys(s().doc.components[instance]?.parts ?? {})).toEqual(["box"])
  })
})
