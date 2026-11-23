import { describe, expect, it } from "vitest"
import { gt2PitchDiameter } from "@/core/generators/pulley/gt2/profile"
import { instantiateComponent } from "@/core/library/instantiate"
import { at, generated } from "@/core/library/testing/generatedComponent"
import {
  checkIntegrity,
  openSceneBytes,
  serializeScene,
  type AnchorId,
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

async function twoPulleys() {
  const store = createDocumentStore()
  const belts: AnchorId[] = []
  const parts: PartId[] = []
  for (const [teeth, x] of [
    [20, 0],
    [36, 80],
  ] as const) {
    const ready = await generated("pulley.gt2", {
      teeth,
      boreMm: 5,
      beltWidthMm: 6,
      flanges: true,
      hubDiameterMm: 12,
      hubLengthMm: 7,
    })
    const placed = instantiateComponent(store.getState().doc, { ...ready, pose: at(x, 0, 0) })
    store.getState().insertEntities(placed.batch)
    const c = store.getState().doc.components[placed.instance]
    belts.push(c?.anchors.belt as AnchorId)
    parts.push(c?.parts.pulley as PartId)
  }
  return { store, belts, parts }
}

describe("connector actions (PLAN 9.6)", () => {
  it("draws a belt round two pulleys at their pitch radii, as one undo entry", async () => {
    const { store, belts } = await twoPulleys()
    const s = () => store.getState()
    const before = store.temporal.getState().pastStates.length
    const id = s().addConnector("belt", belts)
    if (!id) throw new Error("no belt")
    expect(store.temporal.getState().pastStates.length).toBe(before + 1)
    const belt = s().doc.connectors[id]
    expect(belt?.kind === "belt" && belt.ends.map((e) => e.radiusMm)).toEqual([
      gt2PitchDiameter(20) / 2,
      gt2PitchDiameter(36) / 2,
    ])
    expect(belt?.kind === "belt" && belt.widthMm).toBe(6)
    expect(s().doc.materials[belt?.materialId ?? ("" as never)]?.builtinKey).toBe("std.rubber")
    roundTrips(store, "belt")
    s().updateConnector(id, { widthMm: 9, radii: [7, 12] })
    s().updateConnector(id, { thicknessMm: -1 }) // refused by the schema's bounds
    const edited = s().doc.connectors[id]
    expect(
      edited?.kind === "belt" && [edited.widthMm, edited.thicknessMm, edited.ends[1]?.radiusMm]
    ).toEqual([9, 1.4, 12])
    roundTrips(store, "edited")
    // Delete is one undo entry; undo brings the belt back as it was.
    const steps = store.temporal.getState().pastStates.length
    const kept = s().doc.connectors[id]
    s().deleteConnectors([id])
    expect(Object.hasOwn(s().doc.connectors, id)).toBe(false)
    expect(store.temporal.getState().pastStates.length).toBe(steps + 1)
    roundTrips(store, "deleted")
    store.temporal.getState().undo()
    expect(s().doc.connectors[id]).toEqual(kept)
  })

  it("refuses ends that do not fit the kind, and goes with an end's part", async () => {
    const { store, belts, parts } = await twoPulleys()
    const s = () => store.getState()
    expect(s().addConnector("tube", [belts[0] as AnchorId])).toBeNull()
    expect(s().addConnector("belt", [belts[0] as AnchorId, belts[0] as AnchorId])).toBeNull()
    const tube = s().addConnector("tube", belts)
    const spring = s().addConnector("spring", belts)
    expect(tube && spring).toBeTruthy()
    s().deleteParts([parts[1] as PartId])
    roundTrips(store, "part deleted")
    expect(s().doc.connectors).toEqual({})
    store.temporal.getState().undo()
    expect(Object.keys(s().doc.connectors)).toHaveLength(2)
  })

  it("falls back to the default material when its material is deleted", async () => {
    const { store, belts } = await twoPulleys()
    const s = () => store.getState()
    const id = s().addConnector("spring", belts)
    const material = id ? s().doc.connectors[id]?.materialId : null
    if (!id || !material) throw new Error("no spring")
    s().deleteMaterial(material)
    expect(s().doc.connectors[id]?.materialId).toBeNull()
    roundTrips(store, "material deleted")
  })
})
