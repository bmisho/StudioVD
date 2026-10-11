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
