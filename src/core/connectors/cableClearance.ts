import { add, length, scale, sub } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"

/**
 * Where a point of a cable's centreline must go to clear the parts (its surface `radius` away
 * from any solid), or null when it already does. Supplied by the view (signed distance to the
 * parts' meshes); the core stays free of three.js.
 */
export type ClearPoint = (p: Vec3, radius: number) => Vec3 | null

const ORIGIN: Vec3 = [0, 0, 0]
/** Gauss-Seidel passes over the segment lengths after each push. */
const LENGTH_PASSES = 3

/**
 * A laid cable pushed out of the parts it would pass through (0.2.2): points inside a part
 * move to its surface, then the segments are walked back towards their laid lengths, a few
 * rounds, ending on a push so nothing is left inside. Points with `fixed` (the ends, their
 * straight leads, the waypoints) stay where they are. A cable that touches nothing comes back
 * unchanged after one pass. Being pushed round a part can make the drawn cable a little longer
 * than its length (the length is what is cut; the drawing shows where it can go).
 */
export function clearOfParts(
  points: readonly Vec3[],
  radius: number,
  fixed: (i: number) => boolean,
  clear: ClearPoint,
  rounds = 12
): Vec3[] {
  const p: Vec3[] = points.map((v) => [v[0], v[1], v[2]])
  const rest = p.slice(1).map((v, i) => length(sub(v, p[i] ?? ORIGIN)))
  const push = (): boolean => {
    let moved = false
    for (let i = 0; i < p.length; i++) {
      if (fixed(i)) continue
      const q = clear(p[i] ?? ORIGIN, radius)
      if (q) {
        p[i] = q
        moved = true
      }
    }
    return moved
  }
  if (!push()) return p
  for (let round = 1; round < rounds; round++) {
    for (let pass = 0; pass < LENGTH_PASSES; pass++)
      for (let i = 0; i + 1 < p.length; i++) {
        const [a, b] = [p[i] ?? ORIGIN, p[i + 1] ?? ORIGIN]
        const d = sub(b, a)
        const now = length(d)
        if (now < 1e-9) continue
        const [fa, fb] = [fixed(i), fixed(i + 1)]
        if (fa && fb) continue
        const off = scale(d, ((now - (rest[i] ?? now)) / now) * (fa || fb ? 1 : 0.5))
        if (!fa) p[i] = add(a, off)
        if (!fb) p[i + 1] = sub(b, off)
      }
    if (!push()) break
  }
  return p
}

/**
 * Which points of a laid centreline stay put: both ends, the straight lead out of each (its
 * first and last `leadMm`), and the point nearest each waypoint (`via`, within `snapMm`).
 */
export function pinnedPoints(
  points: readonly Vec3[],
  leadMm: number,
  via: readonly Vec3[],
  snapMm: number
): (i: number) => boolean {
  const run: number[] = [0]
  for (let i = 1; i < points.length; i++)
    run.push((run[i - 1] ?? 0) + length(sub(points[i] ?? ORIGIN, points[i - 1] ?? ORIGIN)))
  const total = run.at(-1) ?? 0
  const pinned = new Set<number>()
  run.forEach((s, i) => {
    if (s <= leadMm + 1e-9 || s >= total - leadMm - 1e-9) pinned.add(i)
  })
  for (const w of via) {
    let best = -1
    let near = snapMm
    points.forEach((q, i) => {
      const d = length(sub(q, w))
      if (d <= near) [best, near] = [i, d]
    })
    if (best >= 0) pinned.add(best)
  }
  return (i) => pinned.has(i)
}
