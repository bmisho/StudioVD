import { describe, expect, it } from "vitest"
import { psdNullSpace, spanBasis } from "./nullSpace"

/** JᵀJ of dense rows, row-major. */
function gram(rows: number[][], n: number) {
  const g = new Float64Array(n * n)
  for (const r of rows)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) g[i * n + j] = (g[i * n + j] ?? 0) + (r[i] ?? 0) * (r[j] ?? 0)
  return g
}
const times = (rows: number[][], v: number[]) =>
  rows.map((r) => r.reduce((s, x, i) => s + x * (v[i] ?? 0), 0))

describe("null space of a Gram matrix", () => {
  it("ranks independent rows, whatever their order, and spans what they leave", () => {
    const rows = [
      [1, 2, 3, 0],
      [2, 4, 6, 0],
      [0, 1, 1, 5],
    ]
    const { rank, basis } = psdNullSpace(gram(rows, 4), 4, 1e-12) // rounding is ~1e-14
    expect(rank).toBe(2)
    expect(basis).toHaveLength(2)
    for (const v of basis) for (const x of times(rows, v)) expect(x).toBeCloseTo(0, 12)
    expect(spanBasis(basis, 1e-9)).toHaveLength(2) // independent
  })

  it("counts a singular value under the tolerance as zero, and one over it as not", () => {
    const rows = [
      [1, 0],
      [0, 1e-6],
    ]
    expect(psdNullSpace(gram(rows, 2), 2, 1e-10).rank).toBe(1) // (1e-6)² ≤ 1e-10
    expect(psdNullSpace(gram(rows, 2), 2, 1e-14).rank).toBe(2)
    expect(psdNullSpace(new Float64Array(4), 2, 0)).toEqual({
      rank: 0,
      basis: [
        [1, 0],
        [0, 1],
      ],
    })
  })
})

describe("span basis", () => {
  it("is orthonormal, skips what is already spanned within the tolerance, and extends a start", () => {
    const basis = spanBasis(
      [
        [1, 1, 0],
        [2, 2, 1e-9],
        [0, 1, 0],
      ],
      1e-6
    )
    expect(basis).toHaveLength(2)
    const [a, b] = basis
    expect(Math.hypot(...(a ?? []))).toBeCloseTo(1, 12)
    expect((a ?? []).reduce((s, x, i) => s + x * (b?.[i] ?? 0), 0)).toBeCloseTo(0, 12)
    expect(spanBasis([[0, 0, 5]], 1e-6, basis)).toHaveLength(3)
  })
})
