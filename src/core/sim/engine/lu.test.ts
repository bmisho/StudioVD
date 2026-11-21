import { describe, expect, it } from "vitest"
import { matrix, solveInPlace } from "./lu"

const fill = (rows: number[][]) => {
  const m = matrix(rows.length)
  rows.forEach((r, i) => r.forEach((v, j) => (m.a[i * rows.length + j] = v)))
  return m
}

describe("dense LU with partial pivoting", () => {
  it("solves a system that needs pivoting, with rows of very different scale", () => {
    // x = [1, 2, 3]; first pivot is 0, third row is in "pascals".
    const m = fill([
      [0, 2, 1],
      [1, 1, 1],
      [2e5, -1e5, 3e5],
    ])
    const b = new Float64Array([7, 6, 2e5 * 1 - 1e5 * 2 + 3e5 * 3])
    expect(solveInPlace(m, b)).toBe(-1)
    expect([...b].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 2, 3])
  })

  it("names an exactly singular system instead of returning nonsense", () => {
    const m = fill([
      [1, 1],
      [2, 2],
    ])
    expect(solveInPlace(m, new Float64Array([1, 2]))).toBeGreaterThanOrEqual(0)
    expect(solveInPlace(fill([[0]]), new Float64Array([1]))).toBe(0)
  })
})
