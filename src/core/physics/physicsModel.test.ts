import { describe, expect, it } from "vitest"
import { createTestRig, TEST_RIG_HINGE_MM } from "@/core/scene/testRig"
import { createEmptyDocument, type SceneDocument } from "@/core/schema"
import { testMaterial } from "@/core/schema/testing/sampleDocument"
import { DEFAULT_DENSITY_KG_M3, physicsModelFromDocument } from "./physicsModel"
import { quatFromAxisAngle } from "./vec"

function rigDocument(): SceneDocument {
  const doc = createEmptyDocument("0.1.0")
  const rig = createTestRig()
  for (const a of rig.assets) doc.assets[a.id] = a
  for (const p of rig.parts) doc.parts[p.id] = p
  for (const a of rig.anchors) doc.anchors[a.id] = a
  for (const m of rig.mates) doc.mates[m.id] = m
  return doc
}

describe("physicsModelFromDocument", () => {
  it("builds the rig: two boxes and one hinge on +Z at the hinge point", () => {
    const model = physicsModelFromDocument(rigDocument())
    expect(model.bodies.map((b) => b.grounded)).toEqual([true, false])
    expect(model.bodies[1]?.box?.halfExtentsMm).toEqual([30, 4, 30])
    expect(model.bodies[1]?.densityKgMm3).toBeCloseTo(DEFAULT_DENSITY_KG_M3 * 1e-9, 18)
    const [joint] = model.joints
    joint?.pointMm.forEach((v, i) => expect(v).toBeCloseTo(TEST_RIG_HINGE_MM[i] ?? NaN, 12))
    expect(joint?.axis).toEqual([0, 0, 1])
    expect(joint?.contactsEnabled).toBe(true)
  })

  it("puts the joint in world space for a rotated part", () => {
    const doc = rigDocument()
    const base = Object.values(doc.parts).find((p) => p.grounded)
    if (!base) throw new Error("no base")
    base.pose.quaternion = quatFromAxisAngle([0, 1, 0], Math.PI / 2) // +Z axis -> +X
    const [joint] = physicsModelFromDocument(doc).joints
    expect(joint?.axis[0]).toBeCloseTo(1, 12)
    expect(joint?.pointMm[2]).toBeCloseTo(-60.5, 12) // local +X offset -> world -Z
  })

  it("uses the part's material density", () => {
    const doc = rigDocument()
    const alu = testMaterial("std.aluminium-6061", 1)
    doc.materials[alu.id] = alu
    for (const p of Object.values(doc.parts)) p.materialId = alu.id
    expect(physicsModelFromDocument(doc).bodies[0]?.densityKgMm3).toBeCloseTo(2.7e-6, 15)
  })

  it("skips hidden parts, suppressed mates and mates whose parts are gone", () => {
    const doc = rigDocument()
    const mate = Object.values(doc.mates)[0]
    if (!mate) throw new Error("no mate")
    mate.suppressed = true
    expect(physicsModelFromDocument(doc).joints).toEqual([])
    mate.suppressed = false
    const leaf = Object.values(doc.parts).find((p) => !p.grounded)
    if (!leaf) throw new Error("no leaf")
    leaf.visible = false
    const model = physicsModelFromDocument(doc)
    expect(model.bodies).toHaveLength(1)
    expect(model.joints).toEqual([])
  })
})
