import { add, cross, dot, scale, sub } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"
import type { BodyBuilder } from "./builder"
import { cap } from "./planar"
import { at, outlinePoints, signedArea2, type Outline, type Vec2 } from "./outline"

const same = (p: Vec2 | undefined, q: Vec2 | undefined) =>
  !!p && !!q && p[0] === q[0] && p[1] === q[1]

/**
 * Side walls from `bottom` at `y0` up to `top` at `y1` (outlines with the same runs and point
 * counts: a prism when equal, a frustum when scaled), one face per run. `out`: the walls face
 * away from the outline's inside (an outer wall); else into it (a hole's wall).
 */
export function wall(
  b: BodyBuilder,
  bottom: Outline,
  y0: number,
  top: Outline,
  y1: number,
  out: boolean,
  slot = 0
): void {
  if (bottom.length !== top.length) throw new Error("walls need matching outlines")
  const ccw = signedArea2(outlinePoints(bottom)) > 0
  const flip = (ccw !== out) !== y1 < y0
  bottom.forEach((run, k) => {
    const upper = top[k]
    if (!upper || upper.length !== run.length) throw new Error("walls need matching runs")
    const loop = bottom.length === 1 && same(run[0], run.at(-1))
    const count = loop ? run.length - 1 : run.length
    b.face(slot)
    const lo = run.slice(0, count).map((p) => b.vertex(at(p, y0)))
    const hi = upper.slice(0, count).map((p) => b.vertex(at(p, y1)))
    const segments = loop ? count : count - 1
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % count
      const [a, c, d, e] = [lo[i] ?? 0, lo[j] ?? 0, hi[j] ?? 0, hi[i] ?? 0]
      if (flip) b.quad(a, e, d, c)
      else b.quad(a, c, d, e)
    }
  })
}

/** A straight extrusion of `outer` with `holes` from `y0` up to `y1`: walls and both caps. */
export function extrude(
  b: BodyBuilder,
  outer: Outline,
  holes: readonly Outline[],
  y0: number,
  y1: number,
  slot = 0
): void {
  wall(b, outer, y0, outer, y1, true, slot)
  for (const hole of holes) wall(b, hole, y0, hole, y1, false, slot)
  cap(b, y1, outer, holes, true, slot)
  cap(b, y0, outer, holes, false, slot)
}

/**
 * A smooth wall between two closed 3D loops with the same point count (a hole through a
 * plate at any angle): one face, facing away from the loops' centroid axis when `out`.
 */
export function loopWall(
  b: BodyBuilder,
  lo: readonly Vec3[],
  hi: readonly Vec3[],
  out: boolean
): void {
  const n = lo.length
  if (n < 3 || hi.length !== n) throw new Error("loop walls need matching loops")
  const centre = scale(
    lo.reduce((s, p) => add(s, p), [0, 0, 0] as Vec3),
    1 / n
  )
  const [p0, p1, q1] = [lo[0], lo[1], hi[1]]
  if (!p0 || !p1 || !q1) return
  const facing = dot(cross(sub(p1, p0), sub(q1, p0)), sub(p0, centre)) > 0
  const flip = facing !== out
  b.face()
  const a = lo.map((p) => b.vertex(p))
  const c = hi.map((p) => b.vertex(p))
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const [w, x, y, z] = [a[i] ?? 0, a[j] ?? 0, c[j] ?? 0, c[i] ?? 0]
    if (flip) b.quad(w, z, y, x)
    else b.quad(w, x, y, z)
  }
}
