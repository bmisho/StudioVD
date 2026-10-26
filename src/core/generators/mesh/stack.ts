import type { BodyBuilder } from "./builder"
import { outlineArea, type Outline } from "./outline"
import { cap } from "./planar"
import { wall } from "./prism"

/** A prism of a coaxial stack: `outline` from `y0` up to `y1`. */
export interface Section {
  outline: Outline
  y0: number
  y1: number
}

/**
 * A solid of prisms stacked along Y (a pulley: hub, flange, teeth, flange), each touching the
 * next, with an optional bore through all of them. Where the outline changes, the step is the
 * ring between the two (one must contain the other); the same outline object continues the
 * wall. Returns the solid's volume (polygon areas: exact for the mesh drawn).
 */
export function stack(
  b: BodyBuilder,
  sections: readonly Section[],
  bore?: Outline,
  slot = 0
): number {
  const first = sections[0]
  const last = sections.at(-1)
  if (!first || !last) throw new Error("a stack needs sections")
  const holes = bore ? [bore] : []
  let volume = 0
  sections.forEach((s, i) => {
    wall(b, s.outline, s.y0, s.outline, s.y1, true, slot)
    volume += outlineArea(s.outline) * (s.y1 - s.y0)
    const next = sections[i + 1]
    if (!next || next.outline === s.outline) return
    if (Math.abs(next.y0 - s.y1) > 1e-12) throw new Error("stack sections must touch")
    const lowerWider = outlineArea(s.outline) > outlineArea(next.outline)
    const [outer, inner] = lowerWider ? [s.outline, next.outline] : [next.outline, s.outline]
    cap(b, s.y1, outer, [inner], lowerWider, slot)
  })
  cap(b, first.y0, first.outline, holes, false, slot)
  cap(b, last.y1, last.outline, holes, true, slot)
  if (bore) {
    wall(b, bore, first.y0, bore, last.y1, false, slot)
    volume -= outlineArea(bore) * (last.y1 - first.y0)
  }
  return volume
}
