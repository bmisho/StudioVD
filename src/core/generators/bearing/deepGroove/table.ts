import { BD_WAREHOUSE, estimated, standard } from "../../common"

/** Boundary dimensions (ISO 15) of the deep-groove ball bearings offered as presets. */
export const BEARINGS = [
  { designation: "623", d: 3, D: 10, B: 4, r: 0.15 },
  { designation: "624", d: 4, D: 13, B: 5, r: 0.2 },
  { designation: "625", d: 5, D: 16, B: 5, r: 0.3 },
  { designation: "626", d: 6, D: 19, B: 6, r: 0.3 },
  { designation: "608", d: 8, D: 22, B: 7, r: 0.3 },
  { designation: "688", d: 8, D: 16, B: 5, r: 0.3 },
  { designation: "6000", d: 10, D: 26, B: 8, r: 0.3 },
  { designation: "6001", d: 12, D: 28, B: 8, r: 0.3 },
  { designation: "6002", d: 15, D: 32, B: 9, r: 0.3 },
  { designation: "6003", d: 17, D: 35, B: 10, r: 0.3 },
  { designation: "6004", d: 20, D: 42, B: 12, r: 0.6 },
  { designation: "6005", d: 25, D: 47, B: 12, r: 0.6 },
] as const

/** The designation of a bearing with these boundary dimensions, if it is a listed one. */
export const designationOf = (d: number, D: number, B: number): string | undefined =>
  BEARINGS.find((b) => b.d === d && b.D === D && b.B === B)?.designation

export const BEARING_SOURCES = [
  { what: "Boundary dimensions", source: standard(`ISO 15; ${BD_WAREHOUSE} (SKF data)`) },
  { what: "Chamfers", source: standard("ISO 15 r_s min", "medium") },
  {
    what: "Ring shoulders and shields",
    source: estimated(
      "Inner ring 0.29 (D - d) thick, outer ring 0.155 (D - d) radially: within 0.6 mm of SKF's d1/D1 for 608, 625 and 6000",
      "medium"
    ),
  },
]
