import type { Vec3 } from "@/core/schema"
import { frameAt } from "../common"
import type { BodyBuilder } from "../mesh/builder"
import { rectangle } from "../mesh/outline"
import { extrude } from "../mesh/prism"
import { band, pathLength, tube } from "../mesh/sweep"
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

/** A zip tie's strap: about three times as wide as it is thick (estimated: 1.2 × 3.6 mm). */
export const strapWidth = (thicknessMm: number): number => 3 * thicknessMm

/** Where a tie's head sits on its loop: under the bundle, or on its +Z side (on a mount). */
export type HeadAt = "below" | "side"

const HEAD = { radial: 3, tangential: 5, tail: 4 } as const

/**
 * A closed zip tie round a bundle centred at (0, `cy`, 0) along X (0.2.2): a flat strap all
 * round but where it enters the head, the head, and the cut tail leaving it. Returns its volume.
 */
export function zipTie(
  b: BodyBuilder,
  cy: number,
  bundleMm: number,
  thickness: number,
  head: HeadAt,
  slot = 0
): number {
  const width = strapWidth(thickness)
  const radius = bundleMm / 2 + thickness / 2
  const at = head === "below" ? Math.PI : Math.PI / 2
  const gap = HEAD.tangential / radius
  const steps = 48
  const path: Vec3[] = Array.from({ length: steps + 1 }, (_, i) => {
    const a = at + gap / 2 + ((2 * Math.PI - gap) * i) / steps
    return [0, cy + radius * Math.cos(a), radius * Math.sin(a)]
  })
  band(b, path, width, thickness, slot)
  let volume = width * thickness * pathLength(path)
  // The head straddles the strap's line; the tail leaves it along the strap.
  const [hx, hr, ht] = [width + 1.5, HEAD.radial, HEAD.tangential]
  const out = radius - thickness / 2 + hr / 2 // the head's middle, out from the bundle's axis
  if (head === "below") {
    extrude(b, rectangle(hx, ht, 0, 0), [], cy - out - hr / 2, cy - out + hr / 2, slot)
    extrude(
      b,
      rectangle(width, HEAD.tail, 0, -(ht / 2 + HEAD.tail / 2)),
      [],
      cy - radius - thickness / 2,
      cy - radius + thickness / 2,
      slot
    )
  } else {
    extrude(b, rectangle(hx, hr, 0, -out), [], cy - ht / 2, cy + ht / 2, slot)
    extrude(
      b,
      rectangle(width, thickness, 0, -radius),
      [],
      cy - ht / 2 - HEAD.tail,
      cy - ht / 2,
      slot
    )
  }
  volume += hx * hr * ht + width * thickness * HEAD.tail
  return volume
}
