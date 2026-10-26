import { add, cross, normalize, scale } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"

/** A point on a coil of mean radius `R` at angle θ and height y (the rings' convention). */
const coil = (R: number, theta: number, y: number): Vec3 => [
  R * Math.cos(theta),
  y,
  -R * Math.sin(theta),
]

/** Closed coils sit a hair apart (their wires would otherwise touch, face to face). */
export const tightPitch = (d: number): number => 1.05 * d

/**
 * A compression spring's wire centre line from y = d/2 to y = L0 − d/2: `active` turns, plus
 * `closedTurns` at each end with a pitch just over the wire, blended into the active pitch
 * across half a turn. With pitch(τ) = t + (p − t)·b(τ), b the blend, the active pitch p is
 * what makes the heights add up to L0 − d: p − t = (L0 − d − t·N) / ∫b, N all the turns.
 */
export function compressionPath(
  R: number,
  d: number,
  freeLength: number,
  active: number,
  closedTurns: number,
  perTurn: number
): Vec3[] {
  const total = active + 2 * closedTurns
  const t = tightPitch(d)
  const ramp = (x: number) => Math.min(1, Math.max(0, (x + 0.25) / 0.5))
  const blend = (tau: number) =>
    closedTurns === 0 ? 1 : Math.min(ramp(tau - closedTurns), ramp(total - closedTurns - tau))
  const steps = Math.ceil(total * perTurn)
  const taus = Array.from({ length: steps + 1 }, (_, i) => (i * total) / steps)
  const integral = [0] // ∫ b dτ up to each sample (trapezoids)
  for (let i = 1; i <= steps; i++) {
    const [a, b] = [taus[i - 1] ?? 0, taus[i] ?? 0]
    integral.push((integral[i - 1] ?? 0) + ((blend(a) + blend(b)) / 2) * (b - a))
  }
  const whole = integral.at(-1) ?? 1
  const extra = freeLength - d - t * total
  return taus.map((tau, i) =>
    coil(R, 2 * Math.PI * tau, d / 2 + t * tau + (extra * (integral[i] ?? 0)) / whole)
  )
}

/** Half a turn about the horizontal line through (0, h, 0) along `a` (points and vectors). */
function halfTurn(a: Vec3, h: number) {
  const vector = (v: Vec3): Vec3 => {
    const k = 2 * (v[0] * a[0] + v[2] * a[2])
    return [k * a[0] - v[0], -v[1], k * a[2] - v[2]]
  }
  const point = (p: Vec3): Vec3 => add(vector([p[0], p[1] - h, p[2]]), [0, h, 0])
  return { point, vector }
}

/** A cubic Bézier, `n` samples after its start. */
function bezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, n: number): Vec3[] {
  return Array.from({ length: n }, (_, j) => {
    const t = (j + 1) / n
    const [a, b, c, e] = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3]
    return add(add(scale(p0, a), scale(p1, b)), add(scale(p2, c), scale(p3, e)))
  })
}

/**
 * An extension spring's centre line: `turns` close-wound turns from y = 0 up to H, and at
 * each end an S-bend from the coil's end over to the axis, one wire above the coil, then a
 * loop of the coil's radius standing on the axis in the plane of the coil's direction there
 * (308°, so its end clears the bend). Every point stays a wire's width from the rest. The
 * bottom end is the top one turned half a turn about the horizontal line through the coil's
 * middle at angle θ/2, which maps the coil onto itself reversed. Returns where a pin goes
 * through each loop (centre and the loop plane's normal).
 */
export function extensionPath(R: number, d: number, turns: number, perTurn: number) {
  const H = turns * tightPitch(d)
  const theta = 2 * Math.PI * turns
  const count = Math.ceil(turns * perTurn)
  const helix = Array.from({ length: count + 1 }, (_, i) =>
    coil(R, (theta * i) / count, (H * i) / count)
  )
  const w: Vec3 = [-Math.sin(theta), 0, -Math.cos(theta)] // the coil's direction at its end
  const end = helix.at(-1) ?? coil(R, theta, H)
  const foot: Vec3 = [0, H + d, 0] // the loop's lowest point, on the axis
  const k = R / 2
  const bend = bezier(end, add(end, scale(w, k)), add(foot, scale(w, -k)), foot, 12)
  const centre: Vec3 = [0, H + d + R, 0]
  const sweep = 2 * Math.PI - 0.9
  const steps = Math.max(24, Math.round(perTurn * 1.2))
  const loop = Array.from({ length: steps }, (_, j) => {
    const phi = ((j + 1) * sweep) / steps
    return add(centre, add(scale(w, R * Math.sin(phi)), [0, -R * Math.cos(phi), 0]))
  })
  const top = [...bend, ...loop]
  const turn = halfTurn([Math.cos(theta / 2), 0, -Math.sin(theta / 2)], H / 2)
  const normal = normalize(cross(w, [0, 1, 0]))
  return {
    path: [...top.map(turn.point).reverse(), ...helix, ...top],
    hooks: {
      top: { centre, normal, up: [0, 1, 0] as Vec3 },
      bottom: { centre: turn.point(centre), normal: turn.vector(normal), up: [0, -1, 0] as Vec3 },
    },
    coilLength: H,
  }
}
