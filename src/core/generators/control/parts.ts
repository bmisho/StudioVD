import type { Vec3 } from "@/core/schema"
import { frameAt } from "../common"
import type { BodyBuilder } from "../mesh/builder"
import { at, rectangle, type Outline, type Vec2 } from "../mesh/outline"
import { extrude } from "../mesh/prism"
import type { GeneratedAnchor } from "../types"

/** A flat solder lug: `width` across, `thicknessMm` along Y, reaching along +v. */
export interface Lug {
  u: number
  /** Where it starts (inside the body it comes out of) and where its tip is, along v. */
  from: number
  tip: number
  y: number
}

/**
 * Flat solder lugs as tabs (each its own closed shell, starting inside the body so it
 * looks attached), in `slot`. Returns their volume.
 */
export function lugTabs(
  b: BodyBuilder,
  lugs: readonly Lug[],
  width: number,
  thickness: number,
  slot: number
): number {
  let volume = 0
  for (const l of lugs) {
    const len = l.tip - l.from
    extrude(
      b,
      rectangle(width, len, l.u, (l.from + l.tip) / 2),
      [],
      l.y - thickness / 2,
      l.y + thickness / 2,
      slot
    )
    volume += width * len * thickness
  }
  return volume
}

/** Point anchors at the lugs' tips (cable ends), pointing out along +v (world −Z). */
export function lugAnchors(
  body: string,
  lugs: readonly Lug[],
  names: readonly string[]
): Record<string, GeneratedAnchor> {
  const out: Record<string, GeneratedAnchor> = {}
  lugs.forEach((l, i) => {
    out[`lug${i + 1}`] = {
      body,
      name: names[i] ?? `Lug ${i + 1}`,
      kind: "point",
      frame: frameAt(at([l.u, l.tip], l.y), [0, 0, -1], [1, 0, 0]),
      role: "port",
    }
  })
  return out
}

/**
 * A D-shaped shaft section: a circle of radius `r` with a flat `flat` deep on +v. Two runs
 * (the round and the flat), so the flat is its own face.
 */
export function dOutline(r: number, flat: number, n: number): Outline {
  const v0 = r - flat
  const u0 = Math.sqrt(r * r - v0 * v0)
  const right: Vec2 = [u0, v0]
  const left: Vec2 = [-u0, v0]
  const a0 = Math.atan2(v0, u0)
  const a1 = Math.PI - a0
  const sweep = 2 * Math.PI - (a1 - a0)
  const arc: Vec2[] = [left]
  for (let j = 1; j < n; j++) {
    const a = a1 + (sweep * j) / n
    arc.push([r * Math.cos(a), r * Math.sin(a)])
  }
  arc.push(right)
  return [arc, [right, left]]
}

/** An axial anchor on Y at `y`, pointing up or down. */
export const axialY = (
  body: string,
  name: string,
  y: number,
  up: boolean,
  extra: Partial<GeneratedAnchor> = {}
): GeneratedAnchor => ({
  body,
  name,
  kind: "axial",
  frame: frameAt([0, y, 0] as Vec3, [0, up ? 1 : -1, 0], [1, 0, 0]),
  ...extra,
})
