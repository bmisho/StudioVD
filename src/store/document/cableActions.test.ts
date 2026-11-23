import { describe, expect, it } from "vitest"
import { cableStatus } from "@/core/connectors/cableMesh"
import { connectorMesh } from "@/core/connectors/connectorMesh"
import { connectorFrames } from "@/core/connectors/frames"
import { volumeAndCentroid } from "@/core/geometry/massProperties"
import { buildSceneTree } from "@/core/scene/sceneTree"
import { instantiateComponent } from "@/core/library/instantiate"
import { at, generated } from "@/core/library/testing/generatedComponent"
import {
  checkIntegrity,
  openSceneBytes,
  serializeScene,
  type AnchorId,
  type ConnectorId,
  type PartId,
} from "@/core/schema"
import { createDocumentStore } from "./documentStore"

type Store = ReturnType<typeof createDocumentStore>

function roundTrips(store: Store, step: string) {
  const doc = store.getState().doc
  expect(checkIntegrity(doc), step).toEqual([])
  const saved = serializeScene(doc, "0.1.0")
  if (!saved.ok) throw new Error(step)
  const reopened = openSceneBytes(new TextEncoder().encode(saved.json), "0.1.0")
  expect(reopened.ok && reopened.document, step).toEqual({ ...doc, appVersion: "0.1.0" })
}

/** Three parts in a row with an anchor each: a start, a waypoint, an end. */
async function threeAnchors() {
  const store = createDocumentStore()
  const anchors: AnchorId[] = []
  const parts: PartId[] = []
  for (const x of [0, 40, 80]) {
    const ready = await generated("pulley.gt2", {
      teeth: 20,
      boreMm: 5,
      beltWidthMm: 6,
      flanges: true,
      hubDiameterMm: 12,
      hubLengthMm: 7,
    })
    const placed = instantiateComponent(store.getState().doc, { ...ready, pose: at(x, 0, 0) })
    store.getState().insertEntities(placed.batch)
    const c = store.getState().doc.components[placed.instance]
    anchors.push(c?.anchors.belt as AnchorId)
    parts.push(c?.parts.pulley as PartId)
  }
  return { store, anchors, parts }
}

const cableOf = (store: Store, id: ConnectorId) => {
  const c = store.getState().doc.connectors[id]
  if (c?.kind !== "cable") throw new Error("not a cable")
  return c
}

describe("cable actions (PLAN 16.1, 16.3)", () => {
  it("draws a cable through its waypoint, longer than its route, as one undo entry", async () => {
    const { store, anchors } = await threeAnchors()
    const before = store.temporal.getState().pastStates.length
    const id = store.getState().addConnector("cable", anchors)
    if (!id) throw new Error("no cable")
    expect(store.temporal.getState().pastStates.length).toBe(before + 1)
    const c = cableOf(store, id)
    expect([c.ends, c.via]).toEqual([[anchors[0], anchors[2]], [anchors[1]]])
    const frames = connectorFrames(store.getState().doc, c)
    const status = frames && cableStatus(c, frames)
    expect(status?.shortMm).toBe(0)
    expect(c.lengthMm).toBe(Math.ceil((status?.routeMm ?? 0) * 1.15 + 10))
    expect(store.getState().doc.materials[c.materialId ?? ("" as never)]?.builtinKey).toBe(
      "std.pvc"
    )
    roundTrips(store, "cable")
  })

  it("edits length, pair and slack; refuses what the schema refuses", async () => {
    const { store, anchors } = await threeAnchors()
    const id = store.getState().addConnector("cable", anchors)
    if (!id) throw new Error("no cable")
    const s = () => store.getState()
    s().updateConnector(id, { lengthMm: 20, conductors: 2, pitchMm: 8, slack: "coil" })
    s().updateConnector(id, { conductors: 3 as never }) // refused
    s().updateConnector(id, { lengthMm: -5 }) // refused
    const c = cableOf(store, id)
    expect([c.lengthMm, c.conductors, c.pitchMm, c.slack]).toEqual([20, 2, 8, "coil"])
    const frames = connectorFrames(s().doc, c)
    expect((frames && cableStatus(c, frames)?.shortMm) ?? 0).toBeGreaterThan(0)
    roundTrips(store, "edited")
  })

  it("loses a deleted waypoint but keeps its ends; goes with an end", async () => {
    const { store, anchors, parts } = await threeAnchors()
    const id = store.getState().addConnector("cable", anchors)
    if (!id) throw new Error("no cable")
    store.getState().deleteParts([parts[1] as PartId])
    expect(cableOf(store, id).via).toEqual([])
    roundTrips(store, "waypoint deleted")
    store.getState().deleteParts([parts[2] as PartId])
    expect(store.getState().doc.connectors).toEqual({})
    store.temporal.getState().undo()
    store.temporal.getState().undo()
    expect(cableOf(store, id).via).toEqual([anchors[1]])
  })

  it("builds closed meshes for one wire and for a twisted pair", async () => {
    const { store, anchors } = await threeAnchors()
    const id = store.getState().addConnector("cable", anchors)
    if (!id) throw new Error("no cable")
    for (const conductors of [1, 2] as const) {
      store.getState().updateConnector(id, { conductors })
      const c = cableOf(store, id)
      const frames = connectorFrames(store.getState().doc, c)
      const mesh = frames && connectorMesh(c, frames)
      if (!mesh) throw new Error("no mesh")
      const { volumeMm3 } = volumeAndCentroid({ ...mesh })
      // About π r² L per wire (the polygon has the circle's area).
      const expected = conductors * Math.PI * (c.outerMm / 2) ** 2 * c.lengthMm
      expect(volumeMm3 / expected).toBeGreaterThan(0.97)
      expect(volumeMm3 / expected).toBeLessThan(conductors === 1 ? 1.03 : 1.25)
    }
  })
})

describe("cable colour, waypoints and the tree (PLAN 16.3)", () => {
  it("colours cables with one shared material per colour, one undo entry each", async () => {
    const { store, anchors } = await threeAnchors()
    const s = () => store.getState()
    const a = s().addConnector("cable", [anchors[0] as AnchorId, anchors[1] as AnchorId])
    const b = s().addConnector("cable", [anchors[1] as AnchorId, anchors[2] as AnchorId])
    if (!a || !b) throw new Error("no cables")
    const steps = store.temporal.getState().pastStates.length
    s().setCableColour(a, "red")
    expect(store.temporal.getState().pastStates.length).toBe(steps + 1)
    s().setCableColour(b, "red")
    const red = cableOf(store, a).materialId
    expect(cableOf(store, b).materialId).toBe(red)
    expect(s().doc.materials[red ?? ("" as never)]?.name).toBe("Wire (red)")
    roundTrips(store, "coloured")
  })

  it("reorders, removes and adds waypoints; refuses missing, repeated or end anchors", async () => {
    const { store, anchors } = await threeAnchors()
    const s = () => store.getState()
    const [start, mid, end] = anchors as [AnchorId, AnchorId, AnchorId]
    const id = s().addConnector("cable", [start, end])
    if (!id) throw new Error("no cable")
    s().setCableVia(id, [mid])
    expect(cableOf(store, id).via).toEqual([mid])
    s().setCableVia(id, [mid, mid]) // repeated
    s().setCableVia(id, [start]) // an end
    s().setCableVia(id, ["00000000-0000-4000-8000-000000000000" as AnchorId]) // missing
    expect(cableOf(store, id).via).toEqual([mid])
    roundTrips(store, "routed")
    s().setCableVia(id, [])
    expect(cableOf(store, id).via).toEqual([])
  })

  it("marks a cable shorter than its route in the scene tree", async () => {
    const { store, anchors } = await threeAnchors()
    const id = store.getState().addConnector("cable", anchors)
    if (!id) throw new Error("no cable")
    const row = () =>
      buildSceneTree(store.getState().doc)
        .find((n) => n.kind === "connectors")
        ?.children.find((n) => n.kind === "connector" && n.id === id)
    expect(row()).not.toHaveProperty("shortMm")
    store.getState().updateConnector(id, { lengthMm: 10 })
    const marked = row()
    expect(marked?.kind === "connector" && marked.shortMm).toBeGreaterThan(0)
  })
})
