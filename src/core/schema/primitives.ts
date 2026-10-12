import { z } from "zod"

// zod 4 rejects NaN and ±Infinity for z.number(), so every number here is finite.

/** 3-vector. Units depend on the field name suffix (…Mm = millimetres, SI otherwise). */
export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])
export type Vec3 = z.infer<typeof Vec3Schema>

const UNIT_TOLERANCE = 1e-6

function norm(v: readonly number[]): number {
  return Math.hypot(...v)
}

/** Unit quaternion in three.js order [x, y, z, w]. */
export const QuatSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine((q) => Math.abs(norm(q) - 1) < UNIT_TOLERANCE, "quaternion must be unit length")
export type Quat = z.infer<typeof QuatSchema>

export const UnitVec3Schema = Vec3Schema.refine(
  (v) => Math.abs(norm(v) - 1) < UNIT_TOLERANCE,
  "vector must be unit length"
)

/** Rigid pose in millimetres (CLAUDE.md §5: no scale on parts, ever). */
export const PoseSchema = z
  .object({
    positionMm: Vec3Schema,
    quaternion: QuatSchema,
  })
  .strict()
export type Pose = z.infer<typeof PoseSchema>

export const IDENTITY_POSE: Pose = { positionMm: [0, 0, 0], quaternion: [0, 0, 0, 1] }

/** Orthonormal local frame: origin plus primary (z) and reference (x) axes. */
export const FrameSchema = z
  .object({
    originMm: Vec3Schema,
    z: UnitVec3Schema,
    x: UnitVec3Schema,
  })
  .strict()
  .refine(
    (f) => Math.abs(f.z[0] * f.x[0] + f.z[1] * f.x[1] + f.z[2] * f.x[2]) < UNIT_TOLERANCE,
    "frame axes x and z must be orthogonal"
  )
export type Frame = z.infer<typeof FrameSchema>

/** Display names: trimmed, non-empty, bounded. */
export const NameSchema = z.string().trim().min(1).max(120)

/** SPDX licence expression, e.g. `CC-BY-SA-4.0 WITH KiCad-libraries-exception`. */
export const SpdxSchema = z.string().min(1).max(200)

/**
 * Keys chosen by authors (component local keys, parameter names): identifier-like, so never a
 * prototype name or free text.
 */
export const LocalKeySchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/)
  .refine((k) => !["__proto__", "constructor", "prototype"].includes(k), "reserved key")
