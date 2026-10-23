import type { Quat, Vec3 } from "@/core/schema"
import { quatConjugate, rotate, scale } from "@/core/math/vec3"

/**
 * Viscous damping as forces, so released parts come to rest (PLAN 3.9). Rapier's own body
 * damping is ignored for links of a multibody (verified with rapier3d-compat 0.19.2), and
 * hinged parts are multibody links, so the app applies it itself to every awake body.
 * Explicit integration is stable while rate·dt < 2 (10 /s at 1/120 s: 0.083).
 */
export const DAMPING_RATE_PER_S = 10

/** F = −d·m·v (kg·mm/s²). */
export function dampingForce(massKg: number, velocityMmS: Vec3, rate = DAMPING_RATE_PER_S): Vec3 {
  return scale(velocityMmS, -rate * massKg)
}

/**
 * τ = −d·I·ω with the full world inertia tensor I = R·diag(I_p)·Rᵀ, R = the principal axes'
 * world rotation: every spin axis decays at the same rate, whatever the part's shape.
 */
export function dampingTorque(
  principalInertiaKgMm2: Vec3,
  principalAxesWorld: Quat,
  angularVelocity: Vec3,
  rate = DAMPING_RATE_PER_S
): Vec3 {
  const local = rotate(quatConjugate(principalAxesWorld), angularVelocity)
  const torque: Vec3 = [
    -rate * principalInertiaKgMm2[0] * local[0],
    -rate * principalInertiaKgMm2[1] * local[1],
    -rate * principalInertiaKgMm2[2] * local[2],
  ]
  return rotate(principalAxesWorld, torque)
}
