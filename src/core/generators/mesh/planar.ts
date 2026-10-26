import { ShapeUtils, Vector2 } from "three"
import { cross, dot, normalize, sub } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"
import type { BodyBuilder } from "./builder"
import { at, outlinePoints, type Outline } from "./outline"

/**
 * One planar face: `loops[0]` the boundary, the rest holes, as 3D points on one plane, facing
 * `normal`. The points are used as given (never recomputed), so the face welds to the walls
 * built from the same loops. Earcut merges exactly collinear points (hole corners in a row),
 * which would leave a crack against the neighbouring face, so it triangulates coordinates
 * nudged by a deterministic ~1e-7 of the face's size; triangles are wound in that same frame
 * (a sliver over collinear points has no area, but keeps the shell's orientation). A point
 * still dropped throws, so a generator bug fails its golden test.
 */
export function planarFace(b: BodyBuilder, loops: readonly Vec3[][], normal: Vec3, slot = 0): void {
  const n = normalize(normal)
  const outer = loops[0]
  if (!outer || outer.length < 3) throw new Error("a face needs a boundary")
  const origin = outer[0] ?? [0, 0, 0]
  const seed: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = normalize(cross(seed, n))
  const v = cross(n, u) // u × v = n
  const points = loops.flat()
  const size = Math.max(
    ...points.map((p) => Math.abs(dot(sub(p, origin), u)) + Math.abs(dot(sub(p, origin), v))),
    1e-3
  )
  let index = 0
  const flat = (p: Vec3) => {
    const d = sub(p, origin)
    const k = index++
    // Golden-ratio hashing: a fixed, well spread nudge per point (never random).
    const jitter = (x: number) => (((k * 0.6180339887 + x) % 1) - 0.5) * 1e-7 * size
    return new Vector2(dot(d, u) + jitter(0.1), dot(d, v) + jitter(0.7))
  }
  const plane = loops.map((loop) => loop.map(flat))
  const flatPoints = plane.flat()
  const triangles = ShapeUtils.triangulateShape(plane[0] ?? [], plane.slice(1))
  b.face(slot)
  const ids = points.map((p) => b.vertex(p))
  const used = new Uint8Array(points.length)
  for (const [i, j, k] of triangles) {
    if (i === undefined || j === undefined || k === undefined) continue
    const [p, q, r] = [flatPoints[i], flatPoints[j], flatPoints[k]]
    if (!p || !q || !r) continue
    const ccw = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x) >= 0
    const [a, c] = ccw ? [i, k] : [k, i]
    b.triangle(ids[a] ?? 0, ids[j] ?? 0, ids[c] ?? 0)
    used[i] = used[j] = used[k] = 1
  }
  if (used.includes(0)) throw new Error("a planar face dropped a boundary point")
}

/** A horizontal face at height `y` bounded by `outer` with `holes`, facing up or down. */
export function cap(
  b: BodyBuilder,
  y: number,
  outer: Outline,
  holes: readonly Outline[],
  up: boolean,
  slot = 0
): void {
  const loops = [outer, ...holes].map((o) => outlinePoints(o).map((p) => at(p, y)))
  planarFace(b, loops, [0, up ? 1 : -1, 0], slot)
}
