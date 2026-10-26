// Test helper (not app code): whether a closed polyline crosses itself.
import type { Vec2 } from "../mesh/outline"

const orient = (a: Vec2, b: Vec2, c: Vec2) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

/** True when no two non-adjacent edges of the closed polygon intersect (O(n²)). */
export function isSimple(points: readonly Vec2[]): boolean {
  const n = points.length
  const edge = (i: number): [Vec2, Vec2] => [points[i] ?? [0, 0], points[(i + 1) % n] ?? [0, 0]]
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // they share point 0
      const [a, b] = edge(i)
      const [c, d] = edge(j)
      const crosses = orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0
      if (crosses) return false
    }
  return true
}
