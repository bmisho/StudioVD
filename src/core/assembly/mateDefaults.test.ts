import { describe, expect, it } from "vitest"
import { compose, invert, normalizeQuat, type Rigid } from "@/core/math/rigid"
import { cross, normalize } from "@/core/math/vec3"
import type { Anchor, Part, Quat } from "@/core/schema"
import { mateDefaults } from "./mateDefaults"
import { planSnap } from "./mateSnap"
import { anchor, mate, mateDoc, part, prng, type MateDoc } from "./testing/mateFixtures"

/** `v`, which the test set up to exist. */
function must<T>(v: T | undefined | null): T {
  if (v === undefined || v === null) throw new Error("test fixture missing")
  return v
}
const rotation = (q: Quat): Rigid => ({ q, t: [0, 0, 0] })
/** How far snapping with these options turns B's part (radians). */
function turnOf(doc: MateDoc, a: Anchor, b: Anchor, o: { flip: boolean; angleOffsetRad: number }) {
  const plan = planSnap(doc, mate(a, b, "fixed", o))
  const before = must(doc.parts[b.partId]).pose.quaternion
  const after = must(plan.ok ? plan.poses.get(b.partId)?.quaternion : undefined)
  const w = Math.abs(compose(rotation(after), invert(rotation(before))).q[3])
  return 2 * Math.acos(Math.min(1, w))
}
const OPTIONS = [true, false].flatMap((flip) =>
  [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angleOffsetRad) => ({ flip, angleOffsetRad }))
)

describe("new mate defaults", () => {
  it("turn the moved part least of the 8 directions and quarter twists (PLAN 8.2)", () => {
    // Math review: B's z along A's -x, B's x along A's -z. Aligned at 0° turned B 180°; at
    // 180°, 90°.
    const [pa, pb] = [part("A"), part("B")]
    const a = anchor(pa, [0, 0, 0])
    const b = anchor(pb, [0, 0, 0], [-1, 0, 0], [0, 0, -1])
    const doc = mateDoc([pa, pb], [a, b])
    expect(turnOf(doc, a, b, must(mateDefaults(doc, a.id, b.id)))).toBeCloseTo(Math.PI / 2, 9)

    const random = prng(7)
    const r = () => random() - 0.5
    const randomFrame = (on: Part) => {
      const z = normalize([r(), r(), r()])
      return anchor(on, [r(), r(), r()], z, normalize(cross(z, normalize([r(), r(), r()]))))
    }
    for (let i = 0; i < 500; i++) {
      const quaternion = normalizeQuat([r(), r(), r(), r()])
      const [p, q] = [part("P"), part("Q", false, { positionMm: [r(), r(), r()], quaternion })]
      const [x, y] = [randomFrame(p), randomFrame(q)]
      const d = mateDoc([p, q], [x, y])
      const least = Math.min(...OPTIONS.map((o) => turnOf(d, x, y, o)))
      expect(turnOf(d, x, y, must(mateDefaults(d, x.id, y.id)))).toBeCloseTo(least, 9)
    }
  })

  it("pin in a hole: revolute, the turn that moves B least, twist to the nearest 90°", () => {
    const quarter = Math.SQRT1_2
    const [pa, pb] = [
      part("A"),
      part("B", false, { positionMm: [5, 5, 5], quaternion: [0, 0, quarter, quarter] }),
    ]
    const a = anchor(pa, [0, 0, 0], [0, 0, 1], [1, 0, 0])
    const facing = anchor(pb, [0, 0, 0], [0, 0, -1], [1, 0, 0]) // B turned 90° about z
    const same = anchor(pb, [0, 0, 0], [0, 0, 1], [1, 0, 0])
    const doc = mateDoc([pa, pb], [a, facing, same])
    expect(mateDefaults(doc, a.id, facing.id)).toEqual({
      type: "revolute",
      flip: true,
      angleOffsetRad: -Math.PI / 2,
    })
    expect(mateDefaults(doc, a.id, same.id)).toEqual({
      type: "revolute",
      flip: false,
      angleOffsetRad: Math.PI / 2,
    })
    // Snapping with those defaults does not turn B at all.
    for (const b of [facing, same]) {
      const d = must(mateDefaults(doc, a.id, b.id))
      const plan = planSnap(doc, mate(a, b, d.type, d))
      const q = plan.ok ? plan.poses.get(pb.id)?.quaternion : undefined
      const turn = compose(
        { q: must(q), t: [0, 0, 0] },
        invert({ q: pb.pose.quaternion, t: [0, 0, 0] })
      )
      expect(Math.abs(turn.q[3])).toBeCloseTo(1, 12)
    }
  })

  it("points make a spherical mate, planes and mixed kinds a fixed one", () => {
    const [pa, pb] = [part("A"), part("B")]
    const kinds = (ka: Anchor["kind"], kb: Anchor["kind"]) => {
      const [a, b] = [
        anchor(pa, [0, 0, 0], [0, 0, 1], [1, 0, 0], ka),
        anchor(pb, [1, 0, 0], [0, 0, 1], [1, 0, 0], kb),
      ]
      return mateDefaults(mateDoc([pa, pb], [a, b]), a.id, b.id)?.type
    }
    expect([kinds("point", "point"), kinds("planar", "planar"), kinds("axial", "planar")]).toEqual([
      "spherical",
      "fixed",
      "fixed",
    ])
  })
})
