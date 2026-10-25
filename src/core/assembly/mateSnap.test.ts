import { describe, expect, it } from "vitest"
import { compose, normalizeQuat } from "@/core/math/rigid"
import { cross, dot, length, normalize, rotate, sub } from "@/core/math/vec3"
import type { Anchor, Mate, Part, Pose } from "@/core/schema"
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

  it("moves B with everything mated to it; A's side when B's is grounded", () => {
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
  })

  it("moves nothing when both sides are grounded through hinges (a loop through the ground)", () => {
    // Math review: a shaft hinged to one grounded block, mated to another grounded block.
    const [block1, block2, shaft] = [part("Block1", true), part("Block2", true), part("Shaft")]
    const [b1, s1] = [anchor(block1, [0, 0, 0]), anchor(shaft, [0, 0, 0])]
    const [b2, s2] = [anchor(block2, [0, 0, 40]), anchor(shaft, [0, 0, 40])]
    const hinge = mate(b1, s1)
    const doc = mateDoc([block1, block2, shaft], [b1, s1, b2, s2], [hinge])
    const none = { ok: true, moved: "none", poses: new Map() }
    expect(planSnap(doc, mate(s2, b2))).toEqual(none)
    expect(planSnap(doc, mate(b2, s2))).toEqual(none)
    // Fixed to a grounded block, the shaft is grounded itself: a mate on it can hold nothing.
    const welded = { ...doc, mates: { [hinge.id]: { ...hinge, type: "fixed" as const } } }
    expect(planSnap(welded, mate(s2, b2))).toEqual({ ok: false, reason: "grounded" })
    expect(planSnap(doc, mate(b1, b2))).toEqual({ ok: false, reason: "grounded" })
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

  it("is exact for stored quaternions a rounding off unit length (the schema allows 1e-6)", () => {
    // Math review: |q| - 1 = 3.1e-7, anchors 1000 mm out: the mate read "unsatisfied".
    const pose: Pose = { positionMm: [0, 0, 0], quaternion: [0, 0, 0.707107, 0.707107] }
    const [pa, pb] = [part("A", false, pose), part("B", false, pose)]
    const [a, b] = [anchor(pa, [1000, 0, 0]), anchor(pb, [0, 1000, 0])]
    const m = mate(a, b, "fixed")
    expect(mateHolds(snapped(mateDoc([pa, pb], [a, b]), m), m)).toBe(true)
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
