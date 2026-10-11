import type { Vec3 } from "@/core/schema"
import { clampLength, scale, sub } from "./vec"

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
