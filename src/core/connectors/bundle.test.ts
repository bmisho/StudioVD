import { describe, expect, it } from "vitest"
import { bundleDiameterMm } from "./bundle"

describe("cable bundles (0.2.2)", () => {
  it("packs the wires of every cable, a twisted pair as two", () => {
    expect(bundleDiameterMm([])).toBe(0)
    expect(bundleDiameterMm([{ outerMm: 1.6, conductors: 1 }])).toBeCloseTo(1.6, 9)
    expect(bundleDiameterMm([{ outerMm: 1.6, conductors: 2 }])).toBeCloseTo(3.2, 9)
    // Three wires: 1 + 2/√3 of one wire.
    const three = bundleDiameterMm([
      { outerMm: 1, conductors: 2 },
      { outerMm: 1, conductors: 1 },
    ])
    expect(three).toBeCloseTo(1 + 2 / Math.sqrt(3), 4)
    // Mixed sizes count as the largest.
    expect(
      bundleDiameterMm([
        { outerMm: 2, conductors: 1 },
        { outerMm: 1, conductors: 1 },
      ])
    ).toBe(4)
    // Past ten wires, by density.
    expect(bundleDiameterMm([{ outerMm: 1, conductors: 20 }])).toBeCloseTo(Math.sqrt(20 / 0.82), 9)
  })
})
