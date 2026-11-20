import { mateRelative } from "@/core/assembly/mateSnap"
import { unionFind } from "@/core/assembly/unionFind"
import { compose, fromFrame, fromPose, invert, toPose, type Rigid } from "@/core/math/rigid"
import type { Mate, Part, PartId, Pose, SceneDocument } from "@/core/schema"
import { twistAbout } from "./mateCoordinate"

type Doc = Pick<SceneDocument, "parts" | "anchors" | "mates">

const IDENTITY: Rigid = { q: [0, 0, 0, 1], t: [0, 0, 0] }

const has = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined

/**
 * Where B's anchor must be for the mate to hold exactly, keeping how far the joint has moved
 * (PLAN 10.7): a hinge keeps its angle about A's z, a slider its travel along it, a ball its
 * orientation; only the solver's small errors across the joint go.
 */
function exactB(mate: Mate, a: Rigid, b: Rigid): Rigid {
  if (mate.type === "spherical") return { q: b.q, t: a.t }
  const snapped = compose(a, mateRelative(mate))
  const rel = compose(invert(snapped), b) // B in the snapped frame: ideally a turn or slide on z
  if (mate.type === "prismatic") return compose(snapped, { q: [0, 0, 0, 1], t: [0, 0, rel.t[2]] })
  if (mate.type === "revolute") {
    const theta = twistAbout(rel.q, [0, 0, 1])
    return compose(snapped, { q: [0, 0, Math.sin(theta / 2), Math.cos(theta / 2)], t: [0, 0, 0] })
  }
  return snapped
}

/**
 * The poses a test run ends with, made exact (PLAN 10.7 Apply pose): `live` holds where the
 * physics left the parts (a few µm off across joints, as any solver is). Starting from the
 * grounded parts (or, in a floating mechanism, its first part), each joint in turn moves the
 * rigid group on its far side so the mate holds exactly at the joint's own reading. A mate
 * that closes a loop is left as the solver had it. Returns every moved part's pose.
 */
export function settlePoses(doc: Doc, live: ReadonlyMap<PartId, Pose>): Map<PartId, Pose> {
  const parts = Object.values(doc.parts)
  const index = new Map(parts.map((p, i) => [p.id as string, i]))
  const pose = (p: Part) => fromPose(live.get(p.id) ?? p.pose)
  const world = new Map<number, Rigid>(parts.map((p, i) => [i, pose(p)]))
  const ends = (m: Mate) => {
    const [a, b] = [has(doc.anchors, m.anchorA), has(doc.anchors, m.anchorB)]
    const [i, j] = [a && index.get(a.partId), b && index.get(b.partId)]
    return a && b && i !== undefined && j !== undefined && i !== j ? { a, b, i, j } : null
  }
  const active = Object.values(doc.mates).filter((m) => !m.suppressed)
  const rigid = unionFind(parts.length, (i) => parts[i]?.grounded ?? false)
  for (const m of active) {
    const e = m.type === "fixed" ? ends(m) : null
    if (e) rigid.union(e.i, e.j)
  }
  const members = new Map<number, number[]>()
  parts.forEach((_, i) => {
    const root = rigid.find(i)
    members.set(root, [...(members.get(root) ?? []), i])
  })
  const joints = active.flatMap((m) => {
    const e = m.type === "fixed" ? null : ends(m)
    return e && rigid.find(e.i) !== rigid.find(e.j) ? [{ m, ...e }] : []
  })
  const settled = new Set<number>()
  const order = [...members.keys()].sort(
    (x, y) => Number(rigid.isGrounded(y)) - Number(rigid.isGrounded(x))
  )
  for (const start of order) {
    if (settled.has(start)) continue
    settled.add(start)
    const queue = [start]
    while (queue.length > 0) {
      const group = queue.shift() ?? start
      for (const j of joints) {
        const [ga, gb] = [rigid.find(j.i), rigid.find(j.j)]
        const near = ga === group ? "A" : gb === group ? "B" : null
        const far = near === "A" ? gb : ga
        if (!near || settled.has(far)) continue
        const frameA = compose(world.get(j.i) ?? IDENTITY, fromFrame(j.a.frame))
        const frameB = compose(world.get(j.j) ?? IDENTITY, fromFrame(j.b.frame))
        // Move the far side: B's group onto the exact B, or A's group so that B is exact.
        const [current, exact] =
          near === "A"
            ? [frameB, exactB(j.m, frameA, frameB)]
            : [frameA, exactA(j.m, frameA, frameB)]
        const correction = compose(exact, invert(current))
        for (const k of members.get(far) ?? [])
          world.set(k, compose(correction, world.get(k) ?? IDENTITY))
        settled.add(far)
        queue.push(far)
      }
    }
  }
  const out = new Map<PartId, Pose>()
  parts.forEach((p, i) => {
    const r = world.get(i)
    if (!r) return
    const next = toPose(r)
    const same =
      next.positionMm.every((v, k) => v === p.pose.positionMm[k]) &&
      next.quaternion.every((v, k) => v === p.pose.quaternion[k])
    if (!same) out.set(p.id, next)
  })
  return out
}

/**
 * When A's side is the free one: where A's anchor must be so that B (settled) holds exactly.
 * With E = exactB(A, B) = A ∘ rel ∘ M, the anchor A' = B ∘ E⁻¹ ∘ A gives
 * (A' ∘ rel)⁻¹ ∘ B = M: the same pure turn or slide, B where it is.
 */
function exactA(mate: Mate, a: Rigid, b: Rigid): Rigid {
  return compose(compose(b, invert(exactB(mate, a, b))), a)
}
