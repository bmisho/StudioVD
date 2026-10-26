import { mmToM } from "@/core/units"
import { estimated } from "../common"
import type { GeneratedValue } from "../types"

/** Shear modulus G of spring wire (Pa). */
export const SPRING_WIRE = {
  music: { G: 81.7e9, key: "std.steel", name: "music wire" },
  stainless: { G: 69.0e9, key: "std.stainless-304", name: "stainless 302" },
} as const
export type SpringWire = keyof typeof SPRING_WIRE

/** Helical spring rate k = G d⁴ / (8 D³ n) (PLAN §2), SI: N/m from Pa and metres. */
export function springRate(
  G: number,
  wireMm: number,
  meanDiameterMm: number,
  active: number
): number {
  const [d, D] = [mmToM(wireMm), mmToM(meanDiameterMm)]
  return (G * d ** 4) / (8 * D ** 3 * active)
}

export function rateValue(wire: SpringWire, d: number, D: number, n: number): GeneratedValue {
  return {
    value: springRate(SPRING_WIRE[wire].G, d, D, n),
    unit: "N/m",
    source: estimated(
      `k = G d⁴ / (8 D³ n), G = ${SPRING_WIRE[wire].G / 1e9} GPa for ${SPRING_WIRE[wire].name} (typical spring-design tables); ends and initial tension ignored`,
      "medium"
    ),
  }
}

export const SPRING_SOURCES = [
  {
    what: "Shear moduli",
    source: estimated(
      "Music wire (ASTM A228) 81.7 GPa, stainless 302 69 GPa: typical spring-design tables",
      "medium"
    ),
  },
]
