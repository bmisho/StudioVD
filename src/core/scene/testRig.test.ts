import { describe, expect, it } from "vitest"
import { createEmptyDocument, SceneDocumentSchema, type SceneDocument } from "@/core/schema"
import { createTestRig, TEST_RIG_HINGE_MM, TEST_RIG_STOP_RAD } from "./testRig"

function withRig(): SceneDocument {
  const doc = createEmptyDocument("0.1.0")
  const rig = createTestRig()
  for (const a of rig.assets) doc.assets[a.id] = a
  for (const p of rig.parts) doc.parts[p.id] = p
  for (const a of rig.anchors) doc.anchors[a.id] = a
  for (const m of rig.mates) doc.mates[m.id] = m
  return doc
}

describe("createTestRig", () => {
  it("produces a document the schema accepts", () => {
    expect(SceneDocumentSchema.safeParse(withRig()).success).toBe(true)
  })

  it("mints new part, anchor and mate ids on every call", () => {
    const a = createTestRig()
    const b = createTestRig()
    expect(a.parts[0]?.id).not.toBe(b.parts[0]?.id)
    expect(a.anchors[0]?.id).not.toBe(b.anchors[0]?.id)
    expect(a.mates[0]?.id).not.toBe(b.mates[0]?.id)
  })

  it("places both hinge anchors on the same world point", () => {
    const rig = createTestRig()
    for (const anchor of rig.anchors) {
      const part = rig.parts.find((p) => p.id === anchor.partId)
      if (!part) throw new Error("anchor without part")
      // Parts are unrotated, so world = position + local origin.
      const world = part.pose.positionMm.map((v, i) => v + (anchor.frame.originMm[i] ?? NaN))
      world.forEach((v, i) => expect(v).toBeCloseTo(TEST_RIG_HINGE_MM[i] ?? NaN, 9))
    }
  })

  it("hinges the leaf with contacts enabled, 1 mm above the base", () => {
    const rig = createTestRig()
    expect(rig.mates[0]).toMatchObject({ type: "revolute", contactsEnabled: true })
    const [base, leaf] = rig.parts
    expect(base?.grounded).toBe(true)
    expect(leaf?.grounded).toBe(false)
    const baseTop = (base?.pose.positionMm[1] ?? 0) + (rig.assets[0]?.bboxMm.max[1] ?? 0)
    const leafBottom = (leaf?.pose.positionMm[1] ?? 0) + (rig.assets[1]?.bboxMm.min[1] ?? 0)
    expect(leafBottom - baseTop).toBeCloseTo(1, 9)
  })

  it("states the analytic stop angle: -(90° + asin(0.5/60.5))", () => {
    expect((TEST_RIG_STOP_RAD * 180) / Math.PI).toBeCloseTo(-90.4735, 4)
  })
})
