import { describe, expect, it } from "vitest"
import { anchor, mate, mateDoc, part } from "@/core/assembly/testing/mateFixtures"
import { MAX_COORDINATE_MM, newId, type GroupId, type Vec3 } from "@/core/schema"
import { dragPlane, movedPoses, partsToMove, rayOnPlane } from "./moveDrag"

/** Two parts of one component (a group) with a joint between them, and a loose third part. */
function scene(groundedLoose = false) {
  const group = newId<GroupId>()
  const body = { ...part("Body"), parentId: group }
  const shaft = { ...part("Shaft"), parentId: group }
  const loose = part("Loose", groundedLoose)
  const [a, b] = [anchor(body, [0, 0, 0]), anchor(shaft, [0, 0, 0])]
  const doc = {
    ...mateDoc([body, shaft, loose], [a, b], [mate(a, b)]),
    groups: { [group]: { id: group, name: "Pot", parentId: null } },
  }
  return { doc, group, body, shaft, loose }
}

describe("moving parts by dragging them (design mode)", () => {
  it("moves a whole component, a part with everything mated to it, grounded or not", () => {
    const s = scene()
    expect(new Set(partsToMove(s.doc, { kind: "group", id: s.group }))).toEqual(
      new Set([s.body.id, s.shaft.id])
    )
    // A part inside the component carries its mated partner along: the joint stays put.
    expect(new Set(partsToMove(s.doc, { kind: "part", id: s.shaft.id }))).toEqual(
      new Set([s.body.id, s.shaft.id])
    )
    expect(partsToMove(s.doc, { kind: "part", id: s.loose.id })).toEqual([s.loose.id])
    // Grounding fixes parts in test mode, not in the design: a grounded part still moves.
    const g = scene(true)
    expect(partsToMove(g.doc, { kind: "part", id: g.loose.id })).toEqual([g.loose.id])
  })

  it("slides along the ground through the grab point, or upright facing the camera", () => {
    const grab: Vec3 = [10, 5, -3]
    const level = dragPlane(grab, [0, -1, -1], false)
    // A ray from above, aimed down and across: it lands at the grab point's height.
    const hit = rayOnPlane([0, 100, 0], [0.6, -0.8, 0], level)
    expect(hit?.[1]).toBeCloseTo(5, 9)
    expect(hit?.[0]).toBeCloseTo(71.25, 9) // 95 down at 0.75 across per unit down
    const upright = dragPlane(grab, [0.6, -0.8, 0], true)
    expect(upright.normal).toEqual([1, 0, 0])
    expect(rayOnPlane([0, 7, -3], [1, 0, 0], upright)).toEqual([10, 7, -3])
    // Looking straight down there is no "facing": any upright plane through the point.
    expect(dragPlane(grab, [0, -1, 0], true).normal).toEqual([0, 0, 1])
    // Parallel to the plane, or pointing away from it: no hit.
    expect(rayOnPlane([0, 0, 0], [1, 0, 0], level)).toBeNull()
    expect(rayOnPlane([0, 0, 0], [0, -1, 0], level)).toBeNull()
  })

  it("shifts every moved pose by the same amount, keeping rotations, within the limits", () => {
    const s = scene()
    const turned = {
      ...s.shaft,
      pose: { positionMm: [1, 2, 3] as Vec3, quaternion: [0, 0, 1, 0] as const },
    }
    const doc = { parts: { ...s.doc.parts, [turned.id]: turned } }
    const poses = movedPoses(doc, [s.body.id, turned.id], [5, 0, -5])
    expect(poses?.get(turned.id)).toEqual({ positionMm: [6, 2, -2], quaternion: [0, 0, 1, 0] })
    expect(poses?.get(s.body.id)?.positionMm).toEqual([5, 0, -5])
    expect(movedPoses(doc, [s.body.id], [MAX_COORDINATE_MM * 2, 0, 0])).toBeNull()
  })
})
