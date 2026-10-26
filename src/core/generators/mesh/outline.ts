import type { Vec3 } from "@/core/schema"

export type Vec2 = readonly [number, number]

/**
 * A closed 2D outline as runs: each run is one smooth face when extruded or revolved (a
 * straight side, an arc), and each run starts where the previous one ended; the last ends
 * where the first starts. A single run whose last point is its first is a smooth loop (a
 * circle). Outlines lie in the XZ plane: (u, v) is the point (u, y, -v), so counter-clockwise
 * in (u, v) is counter-clockwise seen from +Y.
 */
export type Outline = readonly (readonly Vec2[])[]

/** The 3D point of outline point `p` at height `y`. */
export const at = (p: Vec2, y: number): Vec3 => [p[0], y, -p[1]]

/** Point `j` of `n` on a circle of radius `r` (the one formula, so rings weld bit for bit). */
export function ringPoint(r: number, j: number, n: number, phase = 0): Vec2 {
  const theta = phase + (2 * Math.PI * (j % n)) / n
  return [r * Math.cos(theta), r * Math.sin(theta)]
}

/** A circle: one smooth run of `n` segments. */
export function circle(r: number, n: number, phase = 0): Outline {
  const points = Array.from({ length: n }, (_, j) => ringPoint(r, j, n, phase))
  const first = points[0]
  if (!first) throw new Error("a circle needs segments")
  return [[...points, first]]
}

/** A circle centred elsewhere (a mounting hole). */
export function circleAt(c: Vec2, r: number, n: number): Outline {
  return circle(r, n).map((run) => run.map((p) => [c[0] + p[0], c[1] + p[1]] as const))
}

/** A polygon with a crease at every corner: one run per side. */
export function polygon(points: readonly Vec2[]): Outline {
  return points.map((p, i) => [p, points[(i + 1) % points.length] ?? p])
}

/** A regular hexagon by its width across flats, a corner on +u (rotated by `phase`). */
export function hexagon(acrossFlats: number, phase = 0): Outline {
  const r = acrossFlats / Math.sqrt(3)
  return polygon(Array.from({ length: 6 }, (_, j) => ringPoint(r, j, 6, phase)))
}

/** A rectangle centred on the origin. */
export function rectangle(w: number, d: number, cu = 0, cv = 0): Outline {
  const [u, v] = [w / 2, d / 2]
  return polygon([
    [cu - u, cv - v],
    [cu + u, cv - v],
    [cu + u, cv + v],
    [cu - u, cv + v],
  ])
}

/** A rectangle with round corners (radius `r`, `n` segments a corner); square when r = 0. */
export function roundedRect(w: number, d: number, r: number, n: number): Outline {
  if (r <= 0) return rectangle(w, d)
  const [u, v] = [w / 2 - r, d / 2 - r]
  const centres: Vec2[] = [
    [u, -v],
    [u, v],
    [-u, v],
    [-u, -v],
  ]
  const runs: Vec2[][] = []
  centres.forEach((c, k) => {
    const arc = Array.from({ length: n + 1 }, (_, j) => {
      const theta = ((k - 1) * Math.PI) / 2 + (j * Math.PI) / (2 * n)
      return [c[0] + r * Math.cos(theta), c[1] + r * Math.sin(theta)] as const
    })
    const last = runs.at(-1)?.at(-1)
    const start = arc[0]
    if (last && start) runs.push([last, start]) // the straight side before this corner
    runs.push(arc)
  })
  const first = runs[0]?.[0]
  const end = runs.at(-1)?.at(-1)
  if (first && end) runs.push([end, first])
  return runs
}

/** The outline's points once each, in order. */
export function outlinePoints(outline: Outline): Vec2[] {
  return outline.flatMap((run) => run.slice(0, -1))
}

/** Twice the signed area (positive: counter-clockwise). */
export function signedArea2(points: readonly Vec2[]): number {
  let sum = 0
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length] ?? p
    sum += p[0] * q[1] - q[0] * p[1]
  })
  return sum
}

/** The enclosed area of an outline (polygonal, as meshed). */
export const outlineArea = (outline: Outline): number =>
  Math.abs(signedArea2(outlinePoints(outline))) / 2

/**
 * Splits a closed polyline into runs at corners turning more than `creaseDeg` (a gear's tooth
 * tip, a profile's corners), so each run is one smooth face.
 */
export function smoothRuns(points: readonly Vec2[], creaseDeg = 30): Outline {
  const n = points.length
  const limit = Math.cos((creaseDeg * Math.PI) / 180)
  const corner = (i: number) => {
    const [p, q, r] = [points[(i - 1 + n) % n], points[i], points[(i + 1) % n]]
    if (!p || !q || !r) return false
    const [ax, ay, bx, by] = [q[0] - p[0], q[1] - p[1], r[0] - q[0], r[1] - q[1]]
    return (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by)) < limit
  }
  const starts = points.flatMap((_, i) => (corner(i) ? [i] : []))
  const first = points[0]
  if (!first) return []
  if (starts.length === 0) return [[...points, first]]
  // One corner: a second run boundary opposite it, so no run reads as a smooth loop.
  if (starts.length === 1) starts.push(((starts[0] ?? 0) + Math.floor(n / 2)) % n)
  starts.sort((a, b) => a - b)
  return starts.map((s, k) => {
    const e = starts[(k + 1) % starts.length] ?? s
    const len = ((e - s + n) % n || n) + 1
    return Array.from({ length: len }, (_, j) => points[(s + j) % n] ?? first)
  })
}

/** Moves every point by (du, dv). */
export const shifted = (outline: Outline, du: number, dv: number): Outline =>
  outline.map((run) => run.map((p) => [p[0] + du, p[1] + dv] as const))

/** Scales every point about the origin (a pin's tapered tip). */
export const scaled = (outline: Outline, s: number): Outline =>
  outline.map((run) => run.map((p) => [p[0] * s, p[1] * s] as const))
