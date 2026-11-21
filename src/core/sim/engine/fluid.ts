import type { Medium } from "@/core/schema"

// Fluid properties (PLAN §3): mass flow is what is conserved; volume flow is derived per
// medium. Air is an ideal gas at 20 °C; pressures here are gauge (relative to the atmosphere).

/** Standard atmosphere, Pa. */
export const ATMOSPHERE = 101_325

/** Density at a gauge pressure, kg/m³ (water and oil as incompressible). */
export function density(medium: Medium, gaugePa: number): number {
  switch (medium) {
    case "water":
      return 998.2 // 20 °C
    case "oil":
      return 870 // ISO VG 46 mineral oil, typical at 20 °C
    case "air":
      // ρ = p/(R·T), R = 287.05 J/(kg·K), T = 293.15 K: 1.204 kg/m³ at one atmosphere.
      return (1.204 * Math.max(ATMOSPHERE + gaugePa, 1000)) / ATMOSPHERE
  }
}
