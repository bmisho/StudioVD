import { describe, expect, it } from "vitest"
import { gridFadeRadiusMm, gridLevel, visibleHeightMm } from "./gridLevels"

describe("gridLevel", () => {
  it("shows 10/100 mm at typical framing and switches by decades", () => {
    expect(gridLevel(0.79)).toEqual({ minorMm: 10, majorMm: 100, minorOpacity: 1 })
    const close = gridLevel(0.141)
    expect([close.minorMm, close.majorMm]).toEqual([1, 10])
    expect(close.minorOpacity).toBeCloseTo((1 / 0.141 - 6) / 6, 9) // ≈ 0.182
    expect(gridLevel(3.31).minorMm).toBe(100)
    expect(gridLevel(25.48)).toMatchObject({ minorMm: 1000, majorMm: 10000 })
  })

  it("never goes below 1 mm and never shrinks when zooming out", () => {
    expect(gridLevel(0.001).minorMm).toBe(1)
    let previous = 0
    for (let i = 0; i <= 200; i++) {
      const level = gridLevel(10 ** (-3 + (6 * i) / 200))
      expect(level.minorMm).toBeGreaterThanOrEqual(previous)
      previous = level.minorMm
    }
  })

  it("falls back to 10/100 for unusable input", () => {
    for (const bad of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY]) {
      expect(gridLevel(bad)).toEqual({ minorMm: 10, majorMm: 100, minorOpacity: 1 })
    }
  })
})

describe("visible extent", () => {
  it("uses PLAN §2 for both projections", () => {
    expect(visibleHeightMm({ kind: "perspective", fovDeg: 35, distanceMm: 1000 })).toBeCloseTo(
      630.6,
      1
    )
    expect(visibleHeightMm({ kind: "orthographic", frustumHeight: 700, zoom: 1.2 })).toBeCloseTo(
      583.33,
      2
    )
  })

  it("fades at least three distances out in perspective, and by extent in orthographic", () => {
    const persp = { kind: "perspective", fovDeg: 30, distanceMm: 500 } as const
    expect(gridFadeRadiusMm(persp, 1.5)).toBeGreaterThanOrEqual(1500)
    const ortho = { kind: "orthographic", frustumHeight: 800, zoom: 2 } as const
    expect(gridFadeRadiusMm(ortho, 1.5)).toBeCloseTo(0.75 * 400 * Math.hypot(1, 1.5), 9)
  })
})
