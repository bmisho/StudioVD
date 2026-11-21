import { describe, expect, it } from "vitest"
import { formatSi, parseSi } from "./siText"

describe("engineering numbers", () => {
  it("formats with SI prefixes and parses them back", () => {
    const cases: [number, string][] = [
      [4700, "4.7 k"],
      [1e-7, "100 n"],
      [2.2e6, "2.2 M"],
      [0.25, "250 m"],
      [9, "9"],
      [0, "0"],
      [-0.005, "-5 m"],
      [999.96, "1 k"],
    ]
    for (const [value, text] of cases) expect(formatSi(value), String(value)).toBe(text)
    for (const [value] of cases.slice(0, 7)) expect(parseSi(formatSi(value))).toBeCloseTo(value, 15)
  })

  it("takes typed variants and refuses anything else", () => {
    expect(parseSi("4,7k")).toBe(4700)
    expect(parseSi("10u")).toBeCloseTo(1e-5, 18)
    expect(parseSi(" 2e3 ")).toBe(2000)
    expect(parseSi("4.7K")).toBe(4700)
    for (const bad of ["", "k", "1 kk", "0x10", "1 000", "4.7 x"]) expect(parseSi(bad)).toBeNaN()
  })
})
