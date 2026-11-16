import type { Vec3 } from "@/core/schema"
import { clampLength, scale, sub } from "@/core/math/vec3"

/**
 * Mouse drag in test mode (PLAN 3.9): a force-limited spring pulls the grab point toward the
 * cursor target. Written as a speed-limited, critically damped servo:
 *
 *   v_des = clamp(ω/(2ζ) · (target − grab), v_max)
 *   F     = clamp(2ζ·m_eff·ω · (v_des − v_grab), m_eff·a_max)
 *
 * Without the clamps this is exactly F = k·Δx − c·v with k = m_eff·ω², c = 2ζ·m_eff·ω. The
 * speed limit keeps every step's motion inside the contact prediction distance (so contacts
 * are found before parts interpenetrate), and the force limit keeps pushes into a stop sane.
 * Units: mm, kg, s; forces in kg·mm/s².
 */
export interface DragSpringParams {
  frequencyHz: number
  dampingRatio: number
  maxSpeedMmS: number
  maxAccelMmS2: number
}

export const DRAG_SPRING: DragSpringParams = {
  frequencyHz: 8,
  dampingRatio: 1,
  maxSpeedMmS: 600,
  maxAccelMmS2: 20_000,
}

/**
 * A lower bound on the mass felt at a point `armMm` from the centre of mass of a free body:
 * 1/m_eff = 1/m + r²/I_min. Joints only ever make a body feel heavier, so a spring sized
 * with this bound stays stable (explicit damping needs 2ζω·dt·m/m_eff < 2) whatever the body
 * is attached to.
 */
export function effectiveMass(massKg: number, minInertiaKgMm2: number, armMm: number): number {
  if (massKg <= 0) return 0
  const angular = minInertiaKgMm2 > 0 ? (armMm * armMm) / minInertiaKgMm2 : 0
  return 1 / (1 / massKg + angular)
}

/** A symmetric 3 × 3 matrix: xx, xy, xz, yy, yz, zz. */
export type Sym3 = readonly [number, number, number, number, number, number]

/**
 * The force at a point of a FREE body that gives that point the acceleration `a` (PLAN 10.4):
 * $\mathbf F = K^{-1}\mathbf a$ with the point's mobility
 * $K = \tfrac1m\mathbf 1 - [\mathbf r]_\times\,I^{-1}\,[\mathbf r]_\times$ (`armMm` = r, from the
 * centre of mass; `invInertia` = I⁻¹ in world axes). Exact in every direction, so a rod pulled
 * across its length answers as briskly as a block (the scalar bound above sizes it by its
 * smallest inertia: up to hundreds of times too weak). Joints only make the point less
 * mobile than K says, so the motion never overshoots what was asked: explicit steps stay
 * stable whatever the body is attached to.
 */
export function pointForce(massKg: number, invInertia: Sym3, armMm: Vec3, accel: Vec3): Vec3 {
  if (massKg <= 0) return [0, 0, 0]
  const [rx, ry, rz] = armMm
  const [ixx, ixy, ixz, iyy, iyz, izz] = invInertia
  // K = 1/m − R W R with R = [r]× (R is skew, so −R W R = Rᵀ W R is positive semi-definite).
  const R = [0, -rz, ry, rz, 0, -rx, -ry, rx, 0]
  const W = [ixx, ixy, ixz, ixy, iyy, iyz, ixz, iyz, izz]
  const at = (m: readonly number[], i: number, j: number) => m[i * 3 + j] ?? 0
  const mul = (a: readonly number[], b: readonly number[]) =>
    Array.from({ length: 9 }, (_, n) => {
      const [i, j] = [Math.floor(n / 3), n % 3]
      return at(a, i, 0) * at(b, 0, j) + at(a, i, 1) * at(b, 1, j) + at(a, i, 2) * at(b, 2, j)
    })
  const rwr = mul(mul(R, W), R)
  const k = rwr.map((v, n) => (n % 4 === 0 ? 1 / massKg : 0) - v)
  // Solve K F = a by Cramer's rule (K is symmetric positive definite: det > 0).
  const [a, b, c, d, e, f, g, h, i] = k as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (!(det > 0)) return [0, 0, 0]
  const [x, y, z] = accel
  return [
    (x * (e * i - f * h) - b * (y * i - f * z) + c * (y * h - e * z)) / det,
    (a * (y * i - f * z) - x * (d * i - f * g) + c * (d * z - y * g)) / det,
    (a * (e * z - y * h) - b * (d * z - y * g) + x * (d * h - e * g)) / det,
  ]
}

/**
 * The acceleration the drag asks of the grab point: the servo law of `dragForce` per unit
 * mass, $\mathbf a = \mathrm{clamp}\big(2\zeta\omega\,(\mathbf v_{des} - \mathbf v),\ a_{max}\big)$.
 */
export function dragAcceleration(
  grabMm: Vec3,
  targetMm: Vec3,
  grabVelocityMmS: Vec3,
  params: DragSpringParams = DRAG_SPRING
): Vec3 {
  return dragForce(grabMm, targetMm, grabVelocityMmS, 1, params)
}

export function dragForce(
  grabMm: Vec3,
  targetMm: Vec3,
  grabVelocityMmS: Vec3,
  effectiveMassKg: number,
  params: DragSpringParams = DRAG_SPRING
): Vec3 {
  const omega = 2 * Math.PI * params.frequencyHz
  const zeta = params.dampingRatio
  const desired = clampLength(scale(sub(targetMm, grabMm), omega / (2 * zeta)), params.maxSpeedMmS)
  const force = scale(sub(desired, grabVelocityMmS), 2 * zeta * effectiveMassKg * omega)
  return clampLength(force, effectiveMassKg * params.maxAccelMmS2)
}
