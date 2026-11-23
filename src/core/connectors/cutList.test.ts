import { describe, expect, it } from "vitest"
import type { CutRow } from "./cutList"
import { cutListCsv } from "./cutList"
import { awgConductorMm, WIRE_GAUGES, wireMaterial } from "./wireSpecs"
import type { MaterialId } from "@/core/schema"

const row = (over: Partial<CutRow>): CutRow => ({
  name: "Jack to board",
  colour: "Wire (red)",
  diameterMm: 1.46,
  wires: 1,
  lengthMm: 120,
  waypoints: 2,
  shortMm: 0,
  ...over,
})

describe("cut list and wire sizes (PLAN 16.3)", () => {
  it("writes CSV with a header, CRLF, quoting and no formulas from names", () => {
    const csv = cutListCsv([
      row({}),
      row({ name: 'Battery "+", snap', wires: 2, shortMm: 4.5 }),
      row({ name: "=HYPERLINK(1)" }),
    ])
    expect(csv.split("\r\n")).toEqual([
      "Cable,Colour,Diameter (mm),Wires,Length (mm),Waypoints,Note",
      "Jack to board,Wire (red),1.46,1,120,2,",
      '"Battery ""+"", snap",Wire (red),1.46,twisted pair,120,2,too short by 4.5 mm',
      "'=HYPERLINK(1),Wire (red),1.46,1,120,2,",
      "",
    ])
  })

  it("sizes hook-up wire from the AWG definition plus a 0.41 mm wall", () => {
    // ASTM B258: 22 AWG is 0.6438 mm, 10 AWG 2.588 mm.
    expect(awgConductorMm(22)).toBeCloseTo(0.6438, 4)
    expect(awgConductorMm(10)).toBeCloseTo(2.5882, 3)
    expect(WIRE_GAUGES.find((g) => g.awg === 22)?.outerMm).toBe(1.46)
    const sizes = WIRE_GAUGES.map((g) => g.outerMm)
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a)) // thickest first
  })

  it("makes one material per wire colour and reuses it", () => {
    let n = 0
    const id = () => `00000000-0000-4000-8000-00000000000${n++}` as MaterialId
    const first = wireMaterial({ materials: {} }, "red", id)
    expect(first?.isNew).toBe(true)
    expect([first?.material.name, first?.material.color, first?.material.builtinKey]).toEqual([
      "Wire (red)",
      "#c62828",
      "std.pvc",
    ])
    const materials = first ? { [first.material.id]: first.material } : {}
    expect(wireMaterial({ materials }, "red", id)?.isNew).toBe(false)
    expect(wireMaterial({ materials }, "black", id)?.isNew).toBe(true)
  })
})
