import type { Vec2 } from "@/core/generators/mesh/outline"

/** A pulley the belt wraps: its centre in the belt's plane and the radius it wraps at. */
export interface Wheel {
  centre: Vec2
  radius: number
}

/** A point of the belt's pitch line with its outward normal (away from the wheel it is on). */
export interface BeltPoint {
  p: Vec2
  n: Vec2
}

const angleOf = (v: Vec2) => Math.atan2(v[1], v[0])

/**
 * An open belt around wheels (PLAN 9.6): the wheels taken in order round their centroid, the
 * belt running counter-clockwise outside all of them. Between wheel i and the next it follows
 * their outer tangent: with outward normal n, n·(c_j − c_i) = r_i − r_j, so
 * n = cos φ · right(d̂) + sin φ · d̂ with sin φ = (r_i − r_j) / |c_j − c_i|. Round each wheel it
 * follows an arc from the incoming tangent's normal to the outgoing one. Returns the closed
 * pitch line (no repeated point) and its length, or null when two wheels overlap.
 */
export function beltPath(
  wheels: readonly Wheel[],
  stepRad = Math.PI / 36
): { points: BeltPoint[]; length: number } | null {
  if (wheels.length < 2) return null
  const cx = wheels.reduce((s, w) => s + w.centre[0], 0) / wheels.length
  const cy = wheels.reduce((s, w) => s + w.centre[1], 0) / wheels.length
  const order = [...wheels].sort(
    (a, b) =>
      angleOf([a.centre[0] - cx, a.centre[1] - cy]) - angleOf([b.centre[0] - cx, b.centre[1] - cy])
  )
  const k = order.length
  const normals: Vec2[] = []
  for (let i = 0; i < k; i++) {
    const [a, b] = [order[i], order[(i + 1) % k]]
    if (!a || !b) return null
    const d: Vec2 = [b.centre[0] - a.centre[0], b.centre[1] - a.centre[1]]
    const D = Math.hypot(d[0], d[1])
    if (D <= Math.abs(a.radius - b.radius) + 1e-9) return null // one wheel inside the other
    const [dx, dy] = [d[0] / D, d[1] / D]
    const s = (a.radius - b.radius) / D
    const c = Math.sqrt(1 - s * s)
    normals.push([c * dy + s * dx, -c * dx + s * dy])
  }
  const points: BeltPoint[] = []
  let length = 0
  for (let i = 0; i < k; i++) {
    const w = order[i]
    const nIn = normals[(i - 1 + k) % k]
    const nOut = normals[i]
    if (!w || !nIn || !nOut) return null
    const a0 = angleOf(nIn)
    let a1 = angleOf(nOut)
    while (a1 < a0) a1 += 2 * Math.PI
    if (k === 2 && Math.abs(a1 - a0 - 2 * Math.PI) < 1e-12) a1 = a0 // degenerate: no wrap
    const steps = Math.max(1, Math.ceil((a1 - a0) / stepRad))
    for (let j = 0; j <= steps; j++) {
      const a = a0 + ((a1 - a0) * j) / steps
      const n: Vec2 = [Math.cos(a), Math.sin(a)]
      points.push({ p: [w.centre[0] + w.radius * n[0], w.centre[1] + w.radius * n[1]], n })
    }
    length += w.radius * (a1 - a0)
    const next = order[(i + 1) % k]
    if (!next) return null
    const t0: Vec2 = [w.centre[0] + w.radius * nOut[0], w.centre[1] + w.radius * nOut[1]]
    const t1: Vec2 = [
      next.centre[0] + next.radius * nOut[0],
      next.centre[1] + next.radius * nOut[1],
    ]
    length += Math.hypot(t1[0] - t0[0], t1[1] - t0[1])
  }
  return { points, length }
}
