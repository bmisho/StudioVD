import { describe, expect, it } from "vitest"
import { instantiateComponent } from "@/core/library/instantiate"
import { at, generated } from "@/core/library/testing/generatedComponent"
import { mergeBatch } from "@/core/scene/entityBatch"
import { createEmptyDocument, type Vec3 } from "@/core/schema"
import { placementTarget, SNAP_PX } from "./placementTarget"

/** A fake view: top-down, 1 mm = 1 px, depth = -y (higher is nearer the camera). */
const view = (hit: { point: Vec3; normal: Vec3 } | null, ground: Vec3 | null = [0, 0, 0]) => ({
  probe: () => ({ surface: hit && { partId: "p" as never, ...hit }, ground }),
  toClient: (p: Vec3) => ({ x: p[0], y: p[2], depth: -p[1] / 1000 }),
})

describe("placementTarget", () => {
  it("snaps to the fitting anchor nearest the cursor, the visible face on a near tie", async () => {
    const nut = await generated("fastener.nut", { size: "M3" })
    const screw = await generated("fastener.screw", { size: "M3", lengthMm: 10, head: "socket" })
    const doc = mergeBatch(
      createEmptyDocument("0.1.0"),
      instantiateComponent(createEmptyDocument("0.1.0"), { ...nut, pose: at(0, 0, 0) }).batch
    )
    const found = placementTarget(doc, screw.def.manifest, view(null), 2, 1, false)
    expect(found?.snap).toBe("M3-nut")
    // Both faces project onto the cursor; the top one (y = 2.4) is nearer the camera.
    const frame = found?.target.kind === "anchor" ? found.target.frame : null
    expect(frame?.t[1]).toBeCloseTo(2.4, 9)
    // Alt: no snapping, the ground under the cursor instead.
    expect(placementTarget(doc, screw.def.manifest, view(null), 2, 1, true)?.target.kind).toBe(
      "surface"
    )
    // Too far from any anchor: the surface under the cursor.
    const hit = { point: [50, 3, 50] as Vec3, normal: [0, 1, 0] as Vec3 }
    const far = placementTarget(doc, screw.def.manifest, view(hit), 50 + SNAP_PX, 50, false)
    expect(far).toEqual({ target: { kind: "surface", ...hit, partId: "p" }, snap: null })
  })

  it("lands on the ground off any part, and is null off the view", async () => {
    const box = await generated("primitive.box", { widthMm: 10, heightMm: 10, depthMm: 10 })
    const doc = createEmptyDocument("0.1.0")
    expect(placementTarget(doc, box.def.manifest, view(null, [4, 0, 5]), 4, 5, false)).toEqual({
      target: { kind: "surface", point: [4, 0, 5], normal: [0, 1, 0] },
      snap: null,
    })
    const off = { probe: () => null, toClient: () => null }
    expect(placementTarget(doc, box.def.manifest, off, 0, 0, false)).toBeNull()
  })
})
