import type { Mate, SceneDocument, Vec3 } from "@/core/schema"
import { compose } from "@/core/math/rigid"
import { cross, dot, length, rotate, scale, sub } from "@/core/math/vec3"
import { anchorWorld, mateRelative } from "./mateSnap"

/** How far a held mate's anchors may be apart: 0.1 µm (snapping is exact to ~1e-12 mm). */
export const MATE_POSITION_TOLERANCE_MM = 1e-4
/** How far their axes may be turned apart (radians). */
export const MATE_ANGLE_TOLERANCE_RAD = 1e-6

const sameDirection = (u: Vec3, v: Vec3) =>
  dot(u, v) > 0 && length(cross(u, v)) <= MATE_ANGLE_TOLERANCE_RAD

/**
 * Whether the parts stand where the mate puts them (at their design poses): B's anchor on
 * A's, as the mate's type requires. Spherical: the origins coincide. Revolute: and the z axes
 * line up (turned over if `flip`). Prismatic: z and x line up, B's origin anywhere on A's z.
 * Fixed: the whole frame, twist included. False when an anchor or part is missing.
 */
export function mateHolds(doc: Pick<SceneDocument, "parts" | "anchors">, mate: Mate): boolean {
  const a = Object.hasOwn(doc.anchors, mate.anchorA) ? doc.anchors[mate.anchorA] : undefined
  const b = Object.hasOwn(doc.anchors, mate.anchorB) ? doc.anchors[mate.anchorB] : undefined
  const partA = a && (Object.hasOwn(doc.parts, a.partId) ? doc.parts[a.partId] : undefined)
  const partB = b && (Object.hasOwn(doc.parts, b.partId) ? doc.parts[b.partId] : undefined)
  if (!a || !b || !partA || !partB) return false
  const target = compose(anchorWorld(partA, a), mateRelative(mate))
  const actual = anchorWorld(partB, b)
  const z = rotate(target.q, [0, 0, 1])
  const offset = sub(actual.t, target.t)
  const along: Vec3 = mate.type === "prismatic" ? scale(z, dot(offset, z)) : [0, 0, 0]
  // Doubles hold ~2e-8 mm even at the ±1e8 mm limit: an absolute tolerance is enough.
  if (length(sub(offset, along)) > MATE_POSITION_TOLERANCE_MM) return false
  if (mate.type === "spherical") return true
  if (!sameDirection(z, rotate(actual.q, [0, 0, 1]))) return false
  if (mate.type === "revolute") return true
  return sameDirection(rotate(target.q, [1, 0, 0]), rotate(actual.q, [1, 0, 0]))
}
