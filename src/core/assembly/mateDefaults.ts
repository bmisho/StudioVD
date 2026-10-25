import type { AnchorId, MateType, SceneDocument } from "@/core/schema"
import { compose, invert } from "@/core/math/rigid"
import { anchorWorld, mateRelative } from "./mateSnap"

const QUARTER = Math.PI / 2
/** Directions and quarter twists, in the order a tie picks them: face to face, then 0°. */
const OPTIONS = [true, false].flatMap((flip) =>
  [0, QUARTER, -QUARTER, Math.PI].map((angleOffsetRad) => ({ flip, angleOffsetRad }))
)

/**
 * What a new mate between two anchors starts as (PLAN 8.2), so snapping turns the moved part
 * as little as possible: axial with axial a revolute (a pin in a hole), point with point a
 * spherical, anything else fixed; and of the two directions (z opposed, face to face, or
 * aligned) and four quarter twists, the one whose snap turns the parts least.
 */
export function mateDefaults(
  doc: Pick<SceneDocument, "parts" | "anchors">,
  anchorA: AnchorId,
  anchorB: AnchorId
): { type: MateType; flip: boolean; angleOffsetRad: number } | null {
  const a = Object.hasOwn(doc.anchors, anchorA) ? doc.anchors[anchorA] : undefined
  const b = Object.hasOwn(doc.anchors, anchorB) ? doc.anchors[anchorB] : undefined
  const partA = a && (Object.hasOwn(doc.parts, a.partId) ? doc.parts[a.partId] : undefined)
  const partB = b && (Object.hasOwn(doc.parts, b.partId) ? doc.parts[b.partId] : undefined)
  if (!a || !b || !partA || !partB) return null
  const type: MateType =
    a.kind === "axial" && b.kind === "axial"
      ? "revolute"
      : a.kind === "point" && b.kind === "point"
        ? "spherical"
        : "fixed"
  const worldA = anchorWorld(partA, a)
  const toB = invert(anchorWorld(partB, b))
  // The snap turns B's side by A·R·B⁻¹ (A's side by its inverse: the same angle); the larger
  // its quaternion's |w| = |cos(θ/2)|, the smaller the turn θ.
  let best = OPTIONS[0] ?? { flip: true, angleOffsetRad: 0 }
  let bestW = -1
  for (const option of OPTIONS) {
    const w = Math.abs(compose(compose(worldA, mateRelative(option)), toB).q[3])
    if (w > bestW + 1e-12) [best, bestW] = [option, w]
  }
  return { type, ...best }
}
