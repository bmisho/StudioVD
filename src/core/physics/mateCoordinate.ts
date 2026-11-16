import { anchorWorld, mateRelative } from "@/core/assembly/mateSnap"
import { compose } from "@/core/math/rigid"
import { dot, quatConjugate, quatMultiply, rotate, sub } from "@/core/math/vec3"
import type { Anchor, Mate, Part, Vec3 } from "@/core/schema"

/** The angle in (-π, π] a rotation `q` turns about `axis` (its twist about that axis). */
export function twistAbout(q: readonly [number, number, number, number], axis: Vec3): number {
  const angle = 2 * Math.atan2(dot([q[0], q[1], q[2]], axis), q[3])
  if (angle > Math.PI) return angle - 2 * Math.PI
  return angle <= -Math.PI ? angle + 2 * Math.PI : angle
}

/**
 * A mate's coordinate at its parts' poses (PLAN 8.1, 10.1): how far B's anchor is turned
 * about A's z (revolute, radians) or moved along it (prismatic, mm) from where the mate was
 * snapped. Limits are in this coordinate. Fixed and spherical mates have none (0).
 */
export function mateCoordinate(
  mate: Pick<Mate, "type" | "flip" | "angleOffsetRad">,
  partA: Part,
  anchorA: Anchor,
  partB: Part,
  anchorB: Anchor
): number {
  const a = anchorWorld(partA, anchorA)
  const snapped = compose(a, mateRelative(mate))
  const actual = anchorWorld(partB, anchorB)
  const axis = rotate(a.q, [0, 0, 1])
  if (mate.type === "revolute")
    return twistAbout(quatMultiply(actual.q, quatConjugate(snapped.q)), axis)
  if (mate.type === "prismatic") return dot(sub(actual.t, snapped.t), axis)
  return 0
}
