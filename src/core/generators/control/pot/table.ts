import type { ValueSource } from "@/core/schema"
import { estimated } from "../../common"

export interface PotRow {
  name: string
  bodyDiameterMm: number
  bodyDepthMm: number
  bushingDiameterMm: number
  bushingLengthMm: number
  shaftDiameterMm: number
  /** From the mounting face to the shaft's tip. */
  shaftLengthMm: number
  lugPitchMm: number
  source: ValueSource
}

/**
 * Starting sizes for the two pot bodies pedals use. Every number is a parameter: check the
 * datasheet of the part you buy (bushing and shaft lengths vary most).
 */
export const POTS = {
  "16mm": {
    name: "16 mm potentiometer",
    bodyDiameterMm: 16,
    bodyDepthMm: 7,
    bushingDiameterMm: 7,
    bushingLengthMm: 7,
    shaftDiameterMm: 6,
    shaftLengthMm: 15,
    lugPitchMm: 5,
    source: estimated(
      "Typical 16 mm rotary pots (Alpha 16 mm series and similar): Ø16 body about 7 mm deep, M7×0.75 bushing about 7 mm long, Ø6 shaft about 15 mm from the mounting face, 5 mm lug pitch",
      "low"
    ),
  },
  "24mm": {
    name: "24 mm potentiometer",
    bodyDiameterMm: 24,
    bodyDepthMm: 9,
    bushingDiameterMm: 9.5,
    bushingLengthMm: 9.5,
    shaftDiameterMm: 6.35,
    shaftLengthMm: 19,
    lugPitchMm: 5,
    source: estimated(
      "Typical 24 mm rotary pots (CTS 450 series and similar): Ø24 body, 3/8-32 bushing 3/8 in long, 1/4 in shaft about 3/4 in from the mounting face",
      "low"
    ),
  },
} as const satisfies Record<string, PotRow>

export const ROTATION_SOURCE = estimated(
  "Typical rotary potentiometers: 300° ± 5° mechanical rotation",
  "medium"
)
