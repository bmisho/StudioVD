import { describe, expect, it } from "vitest"
import { fitCircle } from "./circleFit"
import { eigenSymmetric3, type Sym3 } from "./eigen3"

describe("eigenSymmetric3", () => {
  it("diagonalises a known matrix", () => {
    // [[2,1,0],[1,2,0],[0,0,5]] has eigenvalues 5, 3, 1.
    const { values, vectors } = eigenSymmetric3([2, 1, 0, 2, 0, 5])
    expect(values[0]).toBeCloseTo(5, 12)
    expect(values[1]).toBeCloseTo(3, 12)
    expect(values[2]).toBeCloseTo(1, 12)
    expect(Math.abs(vectors[2][0])).toBeCloseTo(Math.SQRT1_2, 12)
    expect(Math.abs(vectors[2][1])).toBeCloseTo(Math.SQRT1_2, 12)
  })

  it("satisfies A v = λ v for an arbitrary symmetric matrix", () => {
    const m: Sym3 = [4.1, -1.3, 0.7, 2.2, 0.9, -3.5]
    const { values, vectors } = eigenSymmetric3(m)
    const mul = (v: number[]) => [
      m[0] * (v[0] ?? 0) + m[1] * (v[1] ?? 0) + m[2] * (v[2] ?? 0),
      m[1] * (v[0] ?? 0) + m[3] * (v[1] ?? 0) + m[4] * (v[2] ?? 0),
      m[2] * (v[0] ?? 0) + m[4] * (v[1] ?? 0) + m[5] * (v[2] ?? 0),
    ]
    vectors.forEach((v, i) => {
      const av = mul(v)
      av.forEach((x, k) => expect(x).toBeCloseTo((values[i] ?? 0) * (v[k] ?? 0), 10))
    })
    expect(values[0]).toBeGreaterThanOrEqual(values[1])
    expect(values[1]).toBeGreaterThanOrEqual(values[2])
  })
})

describe("fitCircle", () => {
  it("recovers centre and radius from a 60° arc", () => {
    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8) * (Math.PI / 3)
      xs.push(12 + 4 * Math.cos(t))
      ys.push(-3 + 4 * Math.sin(t))
    }
    const c = fitCircle(xs, ys)
    expect(c?.cx).toBeCloseTo(12, 9)
    expect(c?.cy).toBeCloseTo(-3, 9)
    expect(c?.r).toBeCloseTo(4, 9)
    expect(c?.rms).toBeLessThan(1e-9)
  })

  it("returns null for collinear points and fewer than three", () => {
    expect(fitCircle([0, 1, 2], [0, 1, 2])).toBeNull()
    expect(fitCircle([0, 1], [0, 1])).toBeNull()
  })
})
