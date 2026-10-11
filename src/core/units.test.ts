import { describe, expect, it } from "vitest"
import {
  densityKgM3ToKgMm3,
  mmToM,
  mToMm,
  newtonsToWorldForce,
  toMm,
  worldForceToNewtons,
} from "./units"

describe("units", () => {
  it("converts lengths both ways", () => {
    expect(mmToM(1500)).toBe(1.5)
    expect(mToMm(0.0025)).toBe(2.5)
  })

  it("converts steel density to the millimetre world", () => {
    // 7850 kg/m³ = 7.85e-6 kg/mm³: a 60 x 8 x 60 mm steel plate weighs 0.226 kg.
    const density = densityKgM3ToKgMm3(7850)
    expect(density).toBeCloseTo(7.85e-6, 15)
    expect(density * 60 * 8 * 60).toBeCloseTo(0.22608, 10)
  })

  it("converts forces: 1 N = 1000 kg·mm/s²", () => {
    expect(newtonsToWorldForce(2)).toBe(2000)
    expect(worldForceToNewtons(500)).toBe(0.5)
  })
})

describe("length units", () => {
  it("converts every import unit to millimetres", () => {
    expect([toMm(2, "mm"), toMm(2, "cm"), toMm(2, "m"), toMm(2, "in"), toMm(1, "ft")]).toEqual([
      2, 20, 2000, 50.8, 304.8,
    ])
  })
})
