import { cross, dot, length, normalize, scale, sub } from "@/core/math/vec3"
import type { Frame, Vec3 } from "@/core/schema"

const AXES: readonly Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

/** The part axis least aligned with `z` (the first of X, Y, Z on a tie). */
function leastAligned(z: Vec3): Vec3 {
  let best: Vec3 = [1, 0, 0]
  let least = Infinity
  for (const axis of AXES) {
    const d = Math.abs(dot(axis, z))
    if (d < least - 1e-12) {
      least = d
      best = axis
    }
  }
  return best
}

/**
 * An anchor frame at `origin` with its z along `z` (PLAN 7.1). Its x is `xHint` made
 * perpendicular to z (an edge's direction), else the part axis least aligned with z, so the
 * same face always gets the same frame. Both axes come out unit length and orthogonal to
 * double precision, well inside the schema's 1e-6.
 */
export function anchorFrame(origin: Vec3, z: Vec3, xHint?: Vec3): Frame {
  const zn = normalize(z)
  const along = (v: Vec3) => sub(v, scale(zn, dot(v, zn)))
  let x = xHint ? along(xHint) : ([0, 0, 0] as Vec3)
  if (length(x) < 1e-9) x = along(leastAligned(zn))
  const xn = normalize(x)
  // One more pass: x was made perpendicular to z before it was normalised.
  return { originMm: plain(origin), z: plain(zn), x: plain(normalize(along(xn))) }
}

/**
 * -0 written to JSON reads back as 0: a document holding it would not be the one it saves
 * (scene.json is the contract), so frames never hold it.
 */
const plain = (v: Vec3): Vec3 => [v[0] + 0, v[1] + 0, v[2] + 0]

/** The frame with any -0 written as 0 (what it reads back as from scene.json). */
export const plainFrame = (f: Frame): Frame => ({
  originMm: plain(f.originMm),
  z: plain(f.z),
  x: plain(f.x),
})

/** The same frame turned over: z reversed, x kept (still right-handed: y flips too). */
export const flipFrame = (frame: Frame): Frame => ({ ...frame, z: plain(scale(frame.z, -1)) })

/** The frame's y axis (z × x). */
export const frameY = (frame: Frame): Vec3 => cross(frame.z, frame.x)

/** "Ø8", "Ø6.35": a diameter in millimetres, at most two decimals. */
export function diameterLabel(radiusMm: number): string {
  return `Ø${Number((2 * radiusMm).toFixed(2))}`
}
