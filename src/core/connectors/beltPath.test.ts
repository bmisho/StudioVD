import { describe, expect, it } from "vitest"
import { beltPath } from "./beltPath"

describe("beltPath", () => {
  it("has the textbook open-belt length for two wheels", () => {
    // L = 2√(C² − (R − r)²) + π(R + r) + 2(R − r)·asin((R − r)/C)
    const [R, r, C] = [20, 8, 100]
    const expected =
      2 * Math.sqrt(C * C - (R - r) ** 2) + Math.PI * (R + r) + 2 * (R - r) * Math.asin((R - r) / C)
    const path = beltPath([
      { centre: [0, 0], radius: R },
      { centre: [C, 0], radius: r },
    ])
    expect(path?.length).toBeCloseTo(expected, 9)
    // Equal wheels: 2C + 2πr.
    const equal = beltPath([
      { centre: [0, 0], radius: 10 },
      { centre: [0, 50], radius: 10 },
    ])
    expect(equal?.length).toBeCloseTo(100 + 20 * Math.PI, 9)
  })

  it("keeps every point at its wheel's radius, normals outward, wrapping three wheels", () => {
    const wheels = [
      { centre: [0, 0] as const, radius: 6.37 },
      { centre: [80, 0] as const, radius: 6.37 },
      { centre: [40, 60] as const, radius: 10 },
    ]
    const path = beltPath(wheels)
    if (!path) throw new Error("no path")
    for (const { p, n } of path.points) {
      const on = wheels.some(
        (w) => Math.abs(Math.hypot(p[0] - w.centre[0], p[1] - w.centre[1]) - w.radius) < 1e-9
      )
      expect(on).toBe(true)
      expect(Math.hypot(n[0], n[1])).toBeCloseTo(1, 12)
    }
    // Counter-clockwise: positive signed area.
    let area = 0
    path.points.forEach(({ p }, i) => {
      const q = path.points[(i + 1) % path.points.length]?.p ?? p
      area += p[0] * q[1] - q[0] * p[1]
    })
    expect(area).toBeGreaterThan(0)
  })

  it("refuses wheels inside each other", () => {
    expect(
      beltPath([
        { centre: [0, 0], radius: 10 },
        { centre: [2, 0], radius: 3 },
      ])
    ).toBeNull()
    expect(beltPath([{ centre: [0, 0], radius: 10 }])).toBeNull()
  })
})
