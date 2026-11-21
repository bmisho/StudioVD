import { describe, expect, it } from "vitest"
import { add, cross, normalize, quatConjugate, rotate, scale, sub } from "@/core/math/vec3"
import { createTestRig } from "@/core/scene/testRig"
import { createEmptyDocument, type SceneDocument, type Vec3 } from "@/core/schema"
import { gravityLoads } from "./gravityLoads"
import { physicsModelFromDocument } from "./physicsModel"

const G: Vec3 = [0, -9.81, 0]

/** The test rig (grounded base, hinged leaf) with the leaf's mass and COM set. */
function lever(massKg: number, comWorld: (hinge: Vec3, axis: Vec3) => Vec3) {
  const rig = createTestRig()
  const doc: SceneDocument = createEmptyDocument("0.1.0")
  for (const a of rig.assets) doc.assets[a.id] = a
  for (const p of rig.parts) doc.parts[p.id] = { ...p }
  for (const a of rig.anchors) doc.anchors[a.id] = a
  for (const m of rig.mates) doc.mates[m.id] = m
  const [base, leaf] = rig.parts
  if (!base || !leaf) throw new Error("rig")
  doc.parts[base.id] = { ...base, grounded: true }
  const joint = physicsModelFromDocument(doc).joints[0]
  if (!joint) throw new Error("no hinge")
  const world = comWorld(joint.pointMm, joint.axis)
  const local = rotate(quatConjugate(leaf.pose.quaternion), sub(world, leaf.pose.positionMm))
  doc.parts[leaf.id] = { ...leaf, massOverrideKg: massKg, comOverrideMm: local }
  return { doc, mate: joint.mateId, axis: joint.axis }
}

describe("gravity from 3D (PLAN 12.6)", () => {
  it("a horizontal lever carries τ = m·g·L about its hinge", () => {
    const L = 250 // mm
    const { doc, mate, axis } = lever(2, (p, a) => {
      // Horizontal and square to the axis: the full lever arm.
      const arm = normalize(cross(a, [0, 1, 0]))
      return add(p, scale(arm, L))
    })
    const load = gravityLoads(doc, G).joints[mate]
    expect(load?.kind).toBe("torque")
    expect(Math.abs(load?.value ?? 0)).toBeCloseTo(2 * 9.81 * 0.25, 9)
    expect(load?.massKg).toBeCloseTo(2, 12)
    // Its sign is the right-hand rule about anchor A's z.
    const arm = scale(normalize(cross(axis, [0, 1, 0])), 0.25)
    const expected = cross(arm, scale(G, 2))
    expect(load?.value).toBeCloseTo(
      expected[0] * axis[0] + expected[1] * axis[1] + expected[2] * axis[2],
      9
    )
  })

  it("no torque when the centre of mass is straight above the hinge", () => {
    const { doc, mate } = lever(2, (p) => add(p, [0, 300, 0]))
    expect(gravityLoads(doc, G).joints[mate]?.value).toBeCloseTo(0, 9)
  })

  it("weighs each part, and nothing loads a joint with ground on both sides", () => {
    const { doc, mate } = lever(2, (p) => add(p, [100, 0, 0]))
    for (const p of Object.values(doc.parts)) doc.parts[p.id] = { ...p, grounded: true }
    const loads = gravityLoads(doc, G)
    expect(Object.values(loads.weightN).every((w) => w > 0)).toBe(true)
    expect(loads.joints[mate]).toBeUndefined()
  })
})
