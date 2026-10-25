// The only place unit conversions live (CLAUDE.md §5). Scene geometry is millimetres; the
// schematic solver is SI. The Rapier world uses mm, kg and s, so its forces are kg·mm/s²
// (millinewtons) and its inertias kg·mm².

export const MM_PER_M = 1000

export const mmToM = (mm: number): number => mm / MM_PER_M
export const mToMm = (m: number): number => m * MM_PER_M

/** kg/m³ (material tables) -> kg/mm³ (Rapier collider density in a millimetre world). */
export const densityKgM3ToKgMm3 = (kgM3: number): number => kgM3 / MM_PER_M ** 3

/** N -> kg·mm/s² (the Rapier world's force unit). */
export const newtonsToWorldForce = (n: number): number => n * MM_PER_M

/** kg·mm/s² -> N. */
export const worldForceToNewtons = (f: number): number => f / MM_PER_M

/** Length units offered when a source file does not state its own (STL, OBJ). */
export const LENGTH_UNITS = ["mm", "cm", "m", "in", "ft"] as const
export type LengthUnit = (typeof LENGTH_UNITS)[number]

/** Millimetres per unit. The inch is exact by definition (1959): 25.4 mm. */
export const MM_PER_UNIT: Readonly<Record<LengthUnit, number>> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
}

export const toMm = (value: number, unit: LengthUnit): number => value * MM_PER_UNIT[unit]

/** Angles: degrees in the UI, radians in the document. */
export const degToRad = (deg: number): number => (deg * Math.PI) / 180
// Divided first: rad * 180 overflows to Infinity past ~1e306 rad.
export const radToDeg = (rad: number): number => rad * (180 / Math.PI)
