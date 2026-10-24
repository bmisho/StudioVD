import type { Frame, Pose, Quat, Vec3 } from "@/core/schema"
import { add, cross, quatConjugate, quatMultiply, rotate, scale } from "./vec3"

/** A rigid transform: rotate by the unit quaternion `q`, then translate by `t` (mm). */
export interface Rigid {
  q: Quat
  t: Vec3
}

export const IDENTITY_RIGID: Rigid = { q: [0, 0, 0, 1], t: [0, 0, 0] }

/** `q` scaled to unit length (a product of unit quaternions drifts by rounding). */
export function normalizeQuat(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3])
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

/** `a` after `b`: x -> a(b(x)). */
export const compose = (a: Rigid, b: Rigid): Rigid => ({
  q: normalizeQuat(quatMultiply(a.q, b.q)),
  t: add(rotate(a.q, b.t), a.t),
})

export function invert(a: Rigid): Rigid {
  const q = quatConjugate(a.q)
  return { q, t: scale(rotate(q, a.t), -1) }
}

export const applyPoint = (a: Rigid, p: Vec3): Vec3 => add(rotate(a.q, p), a.t)

export const fromPose = (pose: Pose): Rigid => ({ q: pose.quaternion, t: pose.positionMm })

/**
 * As a part pose: the quaternion with w ≥ 0 (q and -q are the same rotation; one sign keeps
 * results deterministic) and no -0 anywhere (JSON reads it back as 0: scene.json is the
 * contract).
 */
export function toPose(r: Rigid): Pose {
  const q = normalizeQuat(r.q)
  const s = q[3] < 0 ? -1 : 1
  return {
    positionMm: [r.t[0] + 0, r.t[1] + 0, r.t[2] + 0],
    quaternion: [s * q[0] + 0, s * q[1] + 0, s * q[2] + 0, s * q[3] + 0],
  }
}

/** The rotation whose matrix has columns x, y, z (orthonormal, right-handed). */
export function quatFromBasis(x: Vec3, y: Vec3, z: Vec3): Quat {
  // Shepperd's method: divide by the largest of the four candidates for accuracy.
  const [m00, m10, m20] = x
  const [m01, m11, m21] = y
  const [m02, m12, m22] = z
  const trace = m00 + m11 + m22
  let q: Quat
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1)
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22)
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22)
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11)
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]
  }
  return normalizeQuat(q)
}

/** An anchor frame (part-local) as a transform: its axes x, z × x, z at its origin. */
export const fromFrame = (f: Frame): Rigid => ({
  q: quatFromBasis(f.x, cross(f.z, f.x), f.z),
  t: f.originMm,
})
