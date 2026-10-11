import type { Quat, Vec3 } from "@/core/schema"

// Minimal tuple math for the physics bridge (plain arrays: the Rapier JS API and scene.json
// both speak {x,y,z} / tuples, and this keeps core/physics free of three.js objects).

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/** `a` shortened to at most `max` (direction kept). */
export function clampLength(a: Vec3, max: number): Vec3 {
  const l = length(a)
  return l > max ? scale(a, max / l) : a
}

/** Hamilton product a·b ([x, y, z, w] order, as three.js and scene.json). */
export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

export const quatConjugate = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]]

/** Rotates `v` by the unit quaternion `q`. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [q[0], q[1], q[2]]
  const t = scale(cross(u, v), 2)
  return add(add(v, scale(t, q[3])), cross(u, t))
}

/** Unit quaternion for a rotation of `angleRad` about the unit `axis`. */
export function quatFromAxisAngle(axis: Vec3, angleRad: number): Quat {
  const s = Math.sin(angleRad / 2)
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angleRad / 2)]
}
