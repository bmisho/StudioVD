import { add, cross, scale } from "@/core/math/vec3"
import { MAX_COORDINATE_MM, type Frame, type Vec3 } from "@/core/schema"
import { anchorFrame, plainFrame } from "./anchorFrames"

/** The six directions an anchor can be pointed along in its part's own frame. */
export const PART_AXES = {
  "+X": [1, 0, 0],
  "-X": [-1, 0, 0],
  "+Y": [0, 1, 0],
  "-Y": [0, -1, 0],
  "+Z": [0, 0, 1],
  "-Z": [0, 0, -1],
} as const satisfies Record<string, Vec3>

export type PartAxis = keyof typeof PART_AXES

/**
 * The frame pointed along a part axis, origin kept. Its x stays where it was when it is still
 * square to the new z (a half turn or a turn about x), else it becomes the part axis least
 * aligned with z, as a fresh anchor on a face of that direction would get (`anchorFrame`).
 */
export function pointAlong(frame: Frame, axis: PartAxis): Frame {
  return anchorFrame(frame.originMm, [...PART_AXES[axis]], frame.x)
}

/** The frame turned a quarter about its own z: x goes to where y was (z × x). */
export function quarterTurn(frame: Frame): Frame {
  return plainFrame({ ...frame, x: cross(frame.z, frame.x) })
}

/**
 * The frame moved `mm` along its own z (negative: back into the part); null when that would
 * leave the coordinate range the file format allows.
 */
export function moveAlong(frame: Frame, mm: number): Frame | null {
  if (!Number.isFinite(mm)) return null
  const originMm = add(frame.originMm, scale(frame.z, mm))
  if (!originMm.every((v) => Math.abs(v) <= MAX_COORDINATE_MM)) return null
  return plainFrame({ ...frame, originMm })
}

/** Which part axis the frame points along, if any (to show the matching button pressed). */
export function axisOf(frame: Frame): PartAxis | null {
  for (const [name, v] of Object.entries(PART_AXES) as [PartAxis, Vec3][])
    if (v.every((c, i) => Math.abs(c - (frame.z[i] ?? 0)) < 1e-9)) return name
  return null
}
