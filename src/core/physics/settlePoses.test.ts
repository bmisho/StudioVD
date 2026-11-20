import { describe, expect, it } from "vitest"
import { mateHolds } from "@/core/assembly/mateCheck"
import { anchor, mate, mateDoc, part } from "@/core/assembly/testing/mateFixtures"
import { quatFromAxisAngle, quatMultiply } from "@/core/math/vec3"
import type { Mate, Part, PartId, Pose, Vec3 } from "@/core/schema"
import { mateCoordinate } from "./mateCoordinate"
import { settlePoses } from "./settlePoses"

const Z: Vec3 = [0, 0, 1]
const at = (x: number, y = 0, z = 0): Pose => ({ positionMm: [x, y, z], quaternion: [0, 0, 0, 1] })

/** A pose turned by `rad` about +Z through the origin, plus a small solver-like error. */
function turned(p: Pose, rad: number, errorMm = 0.01, errorRad = 2e-4): Pose {
  const q = quatFromAxisAngle(Z, rad)
  const [x, y, z] = p.positionMm
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return {
    positionMm: [c * x - s * y + errorMm, s * x + c * y - errorMm, z + errorMm],
    quaternion: quatMultiply(quatFromAxisAngle([1, 0, 0], errorRad), quatMultiply(q, p.quaternion)),
  }
}

/** The document after applying `poses`. */
function applied(doc: ReturnType<typeof mateDoc>, poses: Map<PartId, Pose>) {
  const parts = Object.fromEntries(
    Object.values(doc.parts).map((p: Part) => [p.id, { ...p, pose: poses.get(p.id) ?? p.pose }])
  ) as typeof doc.parts
  return { ...doc, parts }
}

describe("settlePoses (PLAN 10.7 Apply pose)", () => {
  it("makes a turned hinge exact and keeps its angle", () => {
    const post = part("Post", true)
    const arm = part("Arm", false, at(40))
    const [a, b] = [anchor(post, [0, 0, 0]), anchor(arm, [-40, 0, 0])]
    const hinge = mate(a, b, "revolute")
    const doc = mateDoc([post, arm], [a, b], [hinge])
    const live = new Map([[arm.id, turned(arm.pose, 0.7)]])
    expect(mateHolds(applied(doc, live), hinge)).toBe(false) // the solver's few µm
    const settled = applied(doc, settlePoses(doc, live))
    expect(mateHolds(settled, hinge)).toBe(true)
    const angle = mateCoordinate(
      hinge,
      settled.parts[post.id] as Part,
      a,
      settled.parts[arm.id] as Part,
      b
    )
    expect(angle).toBeCloseTo(0.7, 3)
  })

  it("keeps a slider's travel, a ball joint's turn, and fixed groups together", () => {
    const base = part("Base", true)
    const carriage = part("Carriage", false, at(0, 20))
    const lamp = part("Lamp", false, at(0, 40))
    const shade = part("Shade", false, at(0, 50))
    const anchors = [
      anchor(base, [0, 20, 0], [1, 0, 0], [0, 1, 0]),
      anchor(carriage, [0, 0, 0], [1, 0, 0], [0, 1, 0]),
      anchor(carriage, [0, 20, 0]),
      anchor(lamp, [0, 0, 0]),
      anchor(lamp, [0, 10, 0]),
      anchor(shade, [0, 0, 0]),
    ] as const
    const [s0, s1, b0, b1, f0, f1] = anchors
    const mates: Mate[] = [
      mate(s0, s1, "prismatic"),
      mate(b0, b1, "spherical"),
      mate(f0, f1, "fixed"),
    ]
    const doc = mateDoc([base, carriage, lamp, shade], [...anchors], mates)
    const shift = (p: Pose, d: Vec3): Pose => ({
      ...p,
      positionMm: [p.positionMm[0] + d[0], p.positionMm[1] + d[1], p.positionMm[2] + d[2]],
    })
    const tiltAbout = (p: Pose, pivot: Vec3): Pose => {
      const r = turned(
        {
          ...p,
          positionMm: [
            p.positionMm[0] - pivot[0],
            p.positionMm[1] - pivot[1],
            p.positionMm[2] - pivot[2],
          ],
        },
        0.4,
        0,
        0
      )
      return {
        quaternion: r.quaternion,
        positionMm: [
          r.positionMm[0] + pivot[0],
          r.positionMm[1] + pivot[1],
          r.positionMm[2] + pivot[2],
        ],
      }
    }
    const live = new Map<PartId, Pose>([
      [carriage.id, shift(carriage.pose, [25, 0.02, -0.01])],
      [lamp.id, shift(tiltAbout(lamp.pose, [0, 40, 0]), [25.01, 0, 0.02])],
      [shade.id, shift(tiltAbout(shade.pose, [0, 40, 0]), [25.01, 0, 0.02])],
    ])
    const settled = applied(doc, settlePoses(doc, live))
    for (const m of mates) expect(mateHolds(settled, m)).toBe(true)
    const travel = mateCoordinate(
      mates[0] as Mate,
      settled.parts[base.id] as Part,
      s0,
      settled.parts[carriage.id] as Part,
      s1
    )
    expect(travel).toBeCloseTo(25, 1)
    const q = settled.parts[lamp.id]?.pose.quaternion ?? [0, 0, 0, 1]
    expect(2 * Math.atan2(q[2], q[3])).toBeCloseTo(0.4, 3) // the ball kept its turn
  })

  it("settles a chain from the ground outwards, each hinge at its own angle", () => {
    const ground = part("Ground", true)
    const links = [0, 1, 2].map((i) => part(`Link ${i}`, false, at(20 + 40 * i)))
    const pins = [ground, ...links]
      .slice(0, 3)
      .map(
        (p, i) =>
          [
            anchor(p, [40 * i - (i === 0 ? 0 : 20 + 40 * (i - 1)), 0, 0]),
            anchor(links[i] as Part, [-20, 0, 0]),
          ] as const
      )
    const hinges = pins.map(([a, b]) => mate(a, b, "revolute"))
    const doc = mateDoc([ground, ...links], pins.flat(), hinges)
    // Every link turned 0.3 more than the one before, all a little off.
    const live = new Map<PartId, Pose>()
    let frame: Pose = at(0)
    links.forEach((l, i) => {
      const angle = 0.3 * (i + 1)
      const base = frame.positionMm
      const pose = turned(at(20), angle, 0.005 * (i + 1), 1e-4)
      live.set(l.id, {
        ...pose,
        positionMm: [
          pose.positionMm[0] + base[0],
          pose.positionMm[1] + base[1],
          pose.positionMm[2],
        ],
      })
      frame = {
        ...frame,
        positionMm: [base[0] + 40 * Math.cos(angle), base[1] + 40 * Math.sin(angle), 0],
      }
    })
    const settled = applied(doc, settlePoses(doc, live))
    for (const h of hinges) expect(mateHolds(settled, h)).toBe(true)
    expect(settlePoses(doc, new Map()).size).toBe(0) // nothing moved, nothing to write
  })
})
