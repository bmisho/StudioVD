import { cross, normalize } from "@/core/math/vec3"
import type { Frame, MaterialRef, ValueSource, Vec3 } from "@/core/schema"

/**
 * Segments for a circle of radius `r` (mm): chords of about 1 mm, a multiple of 4 (so rings
 * reach ±u and ±v exactly and boxes stay symmetric), from 32 (99.4 % of the circle's area)
 * to 72.
 */
export function segmentsFor(r: number): number {
  const n = Math.ceil((2 * Math.PI * r) / 4) * 4
  return Math.min(72, Math.max(32, n))
}

/** An axial frame on the Y axis at height `y`, its z up (+Y) or down. */
export const axisY = (y: number, up = true): Frame => ({
  originMm: [0, y, 0],
  z: [0, up ? 1 : -1, 0],
  x: [1, 0, 0],
})

/** A frame at `origin` with z along `z` and x along `x` made perpendicular to it. */
export function frameAt(origin: Vec3, z: Vec3, x: Vec3): Frame {
  const zu = normalize(z)
  const xu = normalize(cross(cross(zu, x), zu))
  return { originMm: origin, z: zu, x: xu }
}

/** A size as written in names and tags: at most three decimals, no trailing zeros. */
export const mm = (value: number): string => String(Math.round(value * 1000) / 1000)

export const builtin = (key: string): MaterialRef => ({ kind: "builtin", key })

/** A dimension from a standard, with how sure we are of our reading of it. */
export const standard = (
  note: string,
  confidence: ValueSource["confidence"] = "high"
): ValueSource => ({ kind: "standard", note, confidence })

/** A typical value with no single authoritative source (visual geometry). */
export const estimated = (
  note: string,
  confidence: ValueSource["confidence"] = "low"
): ValueSource => ({ kind: "estimated", note, confidence })

export const computed = (note: string): ValueSource => ({
  kind: "computed",
  note,
  confidence: "high",
})

/** Cross-check note shared by the fastener and bearing tables (PLAN 4.2). */
export const BD_WAREHOUSE = "cross-checked against bd_warehouse 0.4.0 data (Apache-2.0)"
