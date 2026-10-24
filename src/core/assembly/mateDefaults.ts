import type { AnchorId, MateType, SceneDocument } from "@/core/schema"
import { dot, quatConjugate, rotate } from "@/core/math/vec3"
import { anchorWorld } from "./mateSnap"

const QUARTER = Math.PI / 2

/**
 * What a new mate between two anchors starts as (PLAN 8.2), so snapping turns the moved part
 * as little as possible: axial with axial a revolute (a pin in a hole), point with point a
 * spherical, anything else fixed; z opposed (face to face) unless B's anchor already points
 * A's way; and B's current twist about A's z, to the nearest 90°.
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
  const worldB = anchorWorld(partB, b)
  const zA = rotate(worldA.q, [0, 0, 1])
  const flip = dot(zA, rotate(worldB.q, [0, 0, 1])) <= 0
  // B's x in A's frame; the mated x is (cos φ, ±sin φ, 0), minus when turned over.
  const x = rotate(quatConjugate(worldA.q), rotate(worldB.q, [1, 0, 0]))
  const raw = Math.hypot(x[0], x[1]) < 1e-9 ? 0 : Math.atan2(flip ? -x[1] : x[1], x[0])
  let angle = Math.round(raw / QUARTER) * QUARTER
  if (angle <= -Math.PI) angle += 2 * Math.PI
  return { type, flip, angleOffsetRad: angle + 0 }
}
