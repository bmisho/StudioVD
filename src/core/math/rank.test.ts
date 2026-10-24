import { describe, expect, it } from "vitest"
import { matrixRank } from "./rank"

describe("matrix rank", () => {
  it("counts independent rows, whatever their order and scale", () => {
    expect(matrixRank([])).toBe(0)
    expect(
      matrixRank([
        [0, 0],
        [0, 0],
      ])
    ).toBe(0)
    expect(
      matrixRank([
        [1, 2, 3],
        [2, 4, 6],
        [0, 1, 1],
      ])
    ).toBe(2)
    expect(
      matrixRank([
        [0, 1],
        [1, 0],
        [1, 1],
      ])
    ).toBe(2)
    expect(
      matrixRank([
        [1e-3, 0],
        [0, 1e3],
      ])
    ).toBe(2)
  })

  it("treats what rounding leaves of a dependent row as zero", () => {
    const a = [0.1, 0.2, 0.3]
    const b = [0.7, 1.1, 1.3]
    const sum = a.map((x, i) => x + (b[i] ?? 0) * 3)
    expect(matrixRank([a, b, sum])).toBe(2)
  })
})
