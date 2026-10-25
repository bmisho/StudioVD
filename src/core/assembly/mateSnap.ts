import { MAX_COORDINATE_MM } from "@/core/schema"
import type {
  Anchor,
  AnchorId,
  Mate,
  MateId,
  Part,
  PartId,
  Pose,
  SceneDocument,
} from "@/core/schema"
import { compose, fromFrame, fromPose, invert, toPose, type Rigid } from "@/core/math/rigid"
import { mateSides, weldedToGround } from "./mateSides"

/** What a mate needs to place its parts (PLAN §2 Snapping). */
export interface MateGeometry {
  anchorA: AnchorId
  anchorB: AnchorId
  /** True: B's anchor faces A's (z opposed, face to face); false: z aligned. */
  flip: boolean
  /** Twist of B's anchor about A's z (radians). */
  angleOffsetRad: number
}

type Doc = Pick<SceneDocument, "parts" | "anchors" | "mates">

/** Turned over: 180° about the anchor's x. */
const FLIP: Rigid = { q: [1, 0, 0, 0], t: [0, 0, 0] }
const twist = (rad: number): Rigid => ({
  q: [0, 0, Math.sin(rad / 2), Math.cos(rad / 2)],
  t: [0, 0, 0],
})

/** The anchor's frame in world coordinates, at its part's pose. */
export const anchorWorld = (part: Part, anchor: Anchor): Rigid =>
  compose(fromPose(part.pose), fromFrame(anchor.frame))

/** B's anchor frame relative to A's when the mate holds: turned over if `flip`, twisted by φ. */
export const mateRelative = (m: Pick<MateGeometry, "flip" | "angleOffsetRad">): Rigid =>
  m.flip ? compose(FLIP, twist(m.angleOffsetRad)) : twist(m.angleOffsetRad)

/** Why a mate cannot be snapped. */
export type SnapRefusal =
  | "missing" // an anchor or part is not in the document
  | "samePart" // both anchors on one part
  | "grounded" // both parts are fixed to the ground (grounded, or by fixed mates): it holds nothing
  | "tooFar" // the moved parts would leave the ±1e8 mm the schema allows

export type SnapPlan =
  | {
      ok: true
      /** Which side moves: B's (the usual), A's (B's side is grounded), or none (a loop:
       *  its parts are joined through other mates, or each side to the ground). */
      moved: "A" | "B" | "none"
      poses: Map<PartId, Pose>
    }
  | { ok: false; reason: SnapRefusal }

const lookup = <K extends string, V>(record: Readonly<Record<K, V>>, key: K): V | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined

/**
 * How to snap the mate (PLAN 8.3): the side not fixed to the ground moves, with everything
 * mated to it (its free sub-assembly), so B's anchor lands on A's:
 * $M_B F_B = M_A F_A R_{flip} R_z(\varphi)$. B's side moves when it can, else A's. Both parts
 * fixed to the ground refuse (the graph's `bothGrounded`). When the anchors are already joined
 * through other mates (`except` left out), or each side to the ground, nothing moves: the
 * mate closes a loop (all grounds count as one), which the assembly graph reports.
 */
export function planSnap(doc: Doc, m: MateGeometry, except?: MateId): SnapPlan {
  const a = lookup(doc.anchors, m.anchorA)
  const b = lookup(doc.anchors, m.anchorB)
  const partA = a && lookup(doc.parts, a.partId)
  const partB = b && lookup(doc.parts, b.partId)
  if (!a || !b || !partA || !partB) return { ok: false, reason: "missing" }
  if (partA.id === partB.id) return { ok: false, reason: "samePart" }
  if (weldedToGround(doc, partA.id, except) && weldedToGround(doc, partB.id, except))
    return { ok: false, reason: "grounded" }
  const sides = mateSides(doc, partA.id, partB.id, except)
  if (sides.connected || (sides.a.grounded && sides.b.grounded))
    return { ok: true, moved: "none", poses: new Map() }

  const worldA = anchorWorld(partA, a)
  const worldB = anchorWorld(partB, b)
  const relative = mateRelative(m)
  let move: Rigid
  let moved: "A" | "B"
  if (!sides.b.grounded) {
    move = compose(compose(worldA, relative), invert(worldB))
    moved = "B"
  } else {
    move = compose(compose(worldB, invert(relative)), invert(worldA))
    moved = "A"
  }

  const poses = new Map<PartId, Pose>()
  for (const id of moved === "B" ? sides.b.parts : sides.a.parts) {
    const part = lookup(doc.parts, id)
    if (!part) continue
    const pose = toPose(compose(move, fromPose(part.pose)))
    if (!pose.positionMm.every((v) => Math.abs(v) <= MAX_COORDINATE_MM))
      return { ok: false, reason: "tooFar" }
    poses.set(id, pose)
  }
  return { ok: true, moved, poses }
}

/**
 * What Snap again would do for a mate (its own pull left out): move parts, nothing (other
 * mates hold its parts: a loop, which snapping cannot close), or why it cannot.
 */
export function resnapEffect(doc: Doc, mate: Mate): "moves" | "loop" | SnapRefusal {
  const plan = planSnap(doc, mate, mate.id)
  if (!plan.ok) return plan.reason
  return plan.moved === "none" ? "loop" : "moves"
}
