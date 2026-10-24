import { describe, expect, it } from "vitest"
import { normalizeQuat, compose, invert } from "@/core/math/rigid"
import { cross, dot, length, normalize, rotate, sub } from "@/core/math/vec3"
import type { Anchor, Mate, Part, Pose } from "@/core/schema"
import { mateDefaults } from "./mateDefaults"
import { mateHolds } from "./mateCheck"
import { anchorWorld, mateRelative, planSnap } from "./mateSnap"
import { anchor, mate, mateDoc, part, prng, type MateDoc } from "./testing/mateFixtures"

const random = prng(42)
const rand = (scale = 1) => (random() - 0.5) * 2 * scale
const randomPose = (): Pose => ({
  positionMm: [rand(500), rand(500), rand(500)],
  quaternion: normalizeQuat([rand(), rand(), rand(), rand()]),
})
/** A random orthonormal anchor frame (as anchorFrame makes them). */
function randomAnchor(on: Part): Anchor {
  const z = normalize([rand(), rand(), rand()])
  const x = normalize(cross(z, normalize([rand(), rand(), rand()])))
  return anchor(on, [rand(50), rand(50), rand(50)], z, x)
}
/** `v`, which the test set up to exist. */
function must<T>(v: T | undefined | null): T {
  if (v === undefined || v === null) throw new Error("test fixture missing")
  return v
}
/** The document with the planned poses applied. */
function snapped(doc: MateDoc, m: Mate): MateDoc {
  const plan = planSnap(doc, m)
  if (!plan.ok) throw new Error(plan.reason)
  const parts = { ...doc.parts }
  for (const [id, pose] of plan.poses) parts[id] = { ...must(parts[id]), pose }
  return { ...doc, parts }
}
const worldOf = (doc: MateDoc, a: Anchor) => anchorWorld(must(doc.parts[a.partId]), a)

describe("mate snapping", () => {
  it("puts B's anchor exactly on A's (< 1e-9 mm), z aligned or opposed, twisted by φ", () => {
    for (let i = 0; i < 300; i++) {
      const [pa, pb] = [part("A", false, randomPose()), part("B", false, randomPose())]
      const [a, b] = [randomAnchor(pa), randomAnchor(pb)]
      const flip = random() < 0.5
      const m = mate(a, b, "fixed", { flip, angleOffsetRad: rand(Math.PI) })
      const doc = snapped(mateDoc([pa, pb], [a, b]), m)
      const [wa, wb] = [worldOf(doc, a), worldOf(doc, b)]
      expect(length(sub(wa.t, wb.t))).toBeLessThan(1e-9)
      const za = rotate(wa.q, [0, 0, 1])
      expect(dot(za, rotate(wb.q, [0, 0, 1]))).toBeCloseTo(flip ? -1 : 1, 12)
      const want = compose(wa, mateRelative(m))
      expect(length(sub(rotate(want.q, [1, 0, 0]), rotate(wb.q, [1, 0, 0])))).toBeLessThan(1e-12)
      expect(mateHolds(doc, m)).toBe(true)
    }
  })

  it("moves B with everything mated to it; A's side when B's is grounded; refuses both", () => {
    const [ground, b, c] = [
      part("Ground", true),
      part("B", false, randomPose()),
      part("C", false, randomPose()),
    ]
    const [ga, ba] = [randomAnchor(ground), randomAnchor(b)]
    const [bc, cb] = [randomAnchor(b), randomAnchor(c)]
    const hinge = mate(bc, cb)
    const base = snapped(mateDoc([ground, b, c], [ga, ba, bc, cb]), hinge) // B–C hinged
    const docWithHinge = { ...base, mates: { [hinge.id]: hinge } }
    const plan = planSnap(docWithHinge, mate(ga, ba))
    expect(plan).toMatchObject({ ok: true, moved: "B" })
    expect(plan.ok && [...plan.poses.keys()].sort()).toEqual([b.id, c.id].sort())
    const after = snapped(docWithHinge, mate(ga, ba))
    expect(mateHolds(after, hinge)).toBe(true) // C came along: its hinge still holds

    // Reversed: the grounded side is B's, so A's side moves instead.
    expect(planSnap(docWithHinge, mate(ba, ga))).toMatchObject({ ok: true, moved: "A" })
    const grounded = {
      ...docWithHinge,
      parts: { ...docWithHinge.parts, [c.id]: { ...c, grounded: true } },
    }
    expect(planSnap(grounded, mate(ga, ba))).toEqual({ ok: false, reason: "grounded" })
  })

  it("moves nothing when the anchors are already joined (the mate closes a loop)", () => {
    const [p, q] = [part("P"), part("Q", false, randomPose())]
    const [a1, b1, a2, b2] = [randomAnchor(p), randomAnchor(q), randomAnchor(p), randomAnchor(q)]
    const first = mate(a1, b1)
    const doc = {
      ...snapped(mateDoc([p, q], [a1, b1, a2, b2]), first),
      mates: { [first.id]: first },
    }
    expect(planSnap(doc, mate(a2, b2))).toEqual({ ok: true, moved: "none", poses: new Map() })
    // Re-snapping the first mate itself leaves it out of what joins them.
    expect(planSnap(doc, first, first.id)).toMatchObject({ ok: true, moved: "B" })
  })

  it("refuses anchors on one part, missing ones, and a move past the coordinate limit", () => {
    const p = part("P")
    const [a, b] = [randomAnchor(p), randomAnchor(p)]
    expect(planSnap(mateDoc([p], [a, b]), mate(a, b))).toEqual({ ok: false, reason: "samePart" })
    expect(planSnap(mateDoc([p], [a]), mate(a, b))).toEqual({ ok: false, reason: "missing" })
    const far = part("Far", true, { positionMm: [9.99e7, 0, 0], quaternion: [0, 0, 0, 1] })
    const q = part("Q")
    const [fa, qa] = [anchor(far, [0, 0, 0]), anchor(q, [-5e6, 0, 0])]
    expect(planSnap(mateDoc([far, q], [fa, qa]), mate(fa, qa))).toEqual({
      ok: false,
      reason: "tooFar",
    })
  })
})

describe("new mate defaults", () => {
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
