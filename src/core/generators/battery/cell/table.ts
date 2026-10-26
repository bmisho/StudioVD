import type { ValueSource } from "@/core/schema"
import { estimated, standard } from "../../common"

export interface CellRow {
  name: string
  diameter: number
  height: number
  /** Positive terminal: its diameter and how far it stands above the shoulder. */
  nub: { diameter: number; height: number }
  massKg: number
  massSource: ValueSource
  volts: number
  chemistry: string
  wrapper: string
  sizeSource: ValueSource
}

/** Cylindrical cells: IEC 60086-2 maxima for primaries, typical datasheets for Li-ion. */
export const CELLS = {
  "18650": {
    name: "18650 Li-ion cell",
    diameter: 18.4,
    height: 65,
    nub: { diameter: 8, height: 0.6 },
    massKg: 0.046,
    massSource: estimated("Typical 18650 datasheets: 45-48 g", "medium"),
    volts: 3.6,
    chemistry: "Li-ion",
    wrapper: "#1e40af",
    sizeSource: estimated(
      "Typical 18650 datasheets: Ø18.3-18.5 × 64.8-65.2 mm; terminal cap estimated",
      "medium"
    ),
  },
  "21700": {
    name: "21700 Li-ion cell",
    diameter: 21.2,
    height: 70.2,
    nub: { diameter: 9, height: 0.6 },
    massKg: 0.068,
    massSource: estimated("Typical 21700 datasheets: 66-70 g", "medium"),
    volts: 3.6,
    chemistry: "Li-ion",
    wrapper: "#166534",
    sizeSource: estimated("Typical 21700 datasheets: Ø21.1-21.3 × 70.0-70.4 mm", "medium"),
  },
  AA: {
    name: "AA cell (LR6)",
    diameter: 14.5,
    height: 50.5,
    nub: { diameter: 5.5, height: 1 },
    massKg: 0.023,
    massSource: estimated("Typical alkaline LR6: 23 g", "medium"),
    volts: 1.5,
    chemistry: "alkaline",
    wrapper: "#3f3f46",
    sizeSource: standard("IEC 60086-2 LR6 maxima: Ø14.5 × 50.5, terminal Ø5.5, ≥ 1 mm"),
  },
  AAA: {
    name: "AAA cell (LR03)",
    diameter: 10.5,
    height: 44.5,
    nub: { diameter: 3.8, height: 0.8 },
    massKg: 0.0115,
    massSource: estimated("Typical alkaline LR03: 11.5 g", "medium"),
    volts: 1.5,
    chemistry: "alkaline",
    wrapper: "#3f3f46",
    sizeSource: standard(
      "IEC 60086-2 LR03 maxima: Ø10.5 × 44.5, terminal Ø3.8, ≥ 0.8 mm",
      "medium"
    ),
  },
} as const satisfies Record<string, CellRow>
