import type { Vec3 } from "@/core/schema"
import { frameAt } from "../common"
import type { BodyBuilder } from "../mesh/builder"
import { pathLength, tube } from "../mesh/sweep"
import type { GeneratedAnchor } from "../types"

/** Sides of the strap's round section. */
const SIDES = 10

/**
 * A strap round a cable bundle (PLAN 16.4): a round wire of radius `thickness / 2` along an
 * arc of radius `radius` about the X axis through (0, `cy`, 0), from `from` to `to` radians
 * measured from +Y, its ends capped (a gap where the arc does not close). Returns its volume.
 */
export function strap(
  b: BodyBuilder,
  cy: number,
  radius: number,
  thickness: number,
  from: number,
  to: number,
  slot = 0
): number {
  const steps = Math.max(8, Math.ceil(((to - from) / (2 * Math.PI)) * 48))
  const path: Vec3[] = Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps
    return [0, cy + radius * Math.cos(a), radius * Math.sin(a)]
  })
  const r = thickness / 2
  tube(b, path, r, SIDES, slot)
  // The tube's polygon has the circle's area (sweep.ts), so π r² per length.
  return Math.PI * r * r * pathLength(path)
}

/** The anchor a cable passes through: at the bundle's centre, along +X (its run). */
export const bundleAnchor = (body: string, cy: number, bundleMm: number): GeneratedAnchor => ({
  body,
  name: "Cable through",
  kind: "axial",
  frame: frameAt([0, cy, 0], [1, 0, 0], [0, 1, 0]),
  interface: `bundle-${Math.round(bundleMm * 10) / 10}mm`,
  role: "reference",
})
