import { describe, expect, it } from "vitest"
import { anchor, mate, mateDoc, part } from "@/core/assembly/testing/mateFixtures"
import { quatFromAxisAngle } from "@/core/math/vec3"
import { MAX_COORDINATE_MM, newId, type GroupId, type Quat, type Vec3 } from "@/core/schema"
import { movedWithPivot, partsOfSelection } from "./selectionTransform"

describe("moving a whole selection with one gizmo (0.2.2)", () => {
  it("takes every part of the selected groups and parts, with what is mated to them", () => {
    const group = newId<GroupId>()
    const [a, b] = [{ ...part("A"), parentId: group }, part("B")]
    const c = part("C")
    const [x, y] = [anchor(b, [0, 0, 0]), anchor(c, [0, 0, 0])]
    const doc = {
      ...mateDoc([a, b, c], [x, y], [mate(x, y)]),
      groups: { [group]: { id: group, name: "Assembly", parentId: null } },
    }
    const ids = partsOfSelection(doc, [
      { kind: "group", id: group },
      { kind: "part", id: b.id },
      { kind: "anchor", id: x.id }, // not a part: ignored
    ])
    expect(new Set(ids)).toEqual(new Set([a.id, b.id, c.id]))
  })

  it("turns every part about the pivot, keeping them where they are to each other", () => {
    const a = {
      ...part("A"),
      pose: { positionMm: [10, 0, 0] as Vec3, quaternion: [0, 0, 0, 1] as Quat },
    }
    const b = {
      ...part("B"),
      pose: { positionMm: [-10, 0, 0] as Vec3, quaternion: [0, 0, 0, 1] as Quat },
    }
    const doc = { parts: { [a.id]: a, [b.id]: b } }
    const quarter = quatFromAxisAngle([0, 1, 0], Math.PI / 2)
    const poses = movedWithPivot(
      doc,
      [a.id, b.id],
      { t: [0, 0, 0], q: [0, 0, 0, 1] },
      { t: [0, 5, 0], q: quarter }
    )
    const pa = poses?.get(a.id)?.positionMm ?? []
    const pb = poses?.get(b.id)?.positionMm ?? []
    // A quarter turn about +Y takes +X to −Z; then up 5.
    ;[0, 5, -10].forEach((v, i) => expect(pa[i]).toBeCloseTo(v, 9))
    ;[0, 5, 10].forEach((v, i) => expect(pb[i]).toBeCloseTo(v, 9))
    expect(poses?.get(a.id)?.quaternion).toEqual(poses?.get(b.id)?.quaternion)
    const far = movedWithPivot(
      doc,
      [a.id],
      { t: [0, 0, 0], q: [0, 0, 0, 1] },
      { t: [MAX_COORDINATE_MM, 0, 0], q: [0, 0, 0, 1] }
    )
    expect(far).toBeNull()
  })
})
