import { computed, estimated } from "../common"
import type { GeneratedValue } from "../types"

/** T8 lead screws: 8 mm, 2 mm pitch; the lead is the pitch times the starts. */
export const T8 = { major: 8, minor: 6.2, pitch: 2 } as const

/** Brass flanged T8 nut as commonly sold (vendor drawings agree within a few tenths). */
export const T8_NUT = {
  flangeDiameter: 22,
  flangeThickness: 3.5,
  barrelDiameter: 10.2,
  length: 15,
  holeDiameter: 3.5,
  holeCircle: 16,
} as const

export const T8_SOURCES = [
  {
    what: "T8 thread",
    source: estimated(
      "8 mm major, 2 mm pitch, about 6.2 mm minor (vendor drawings); drawn as rings, not a helix",
      "medium"
    ),
  },
  {
    what: "Flanged nut",
    source: estimated(
      "Ø22 × 3.5 flange, Ø10.2 barrel, 15 long, 4 × Ø3.5 on Ø16 (common vendor drawing)",
      "medium"
    ),
  },
]

/** Linear speed per angular speed: v = L ω / (2π) (PLAN §2). */
export const leadSpeed = (leadMm: number, omegaRadS: number): number =>
  (leadMm * omegaRadS) / (2 * Math.PI)

export const leadValue = (leadMm: number): GeneratedValue => ({
  value: leadMm,
  unit: "mm/rev",
  source: computed("lead = pitch × starts; v = L ω / 2π"),
})
