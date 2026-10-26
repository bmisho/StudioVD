import { describe, expect, it } from "vitest"
import type { Vec3 } from "@/core/schema"
import { leadSpeed } from "../motion/t8"
import { compressionPath, extensionPath, tightPitch } from "./helix"
import { SPRING_WIRE, springRate } from "./rate"

const O: Vec3 = [0, 0, 0]
const gap = (p: Vec3, q: Vec3) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])

/** The closest approach of two path points at least 2.5 wires apart along the path. */
function clearance(path: readonly Vec3[], d: number): number {
  const s = [0]
  for (let i = 1; i < path.length; i++) {
    s.push((s[i - 1] ?? 0) + gap(path[i - 1] ?? O, path[i] ?? O))
  }
  let worst = Infinity
  for (let i = 0; i < path.length; i++)
    for (let j = i + 1; j < path.length; j++) {
      if ((s[j] ?? 0) - (s[i] ?? 0) < 2.5 * d) continue
      worst = Math.min(worst, gap(path[i] ?? O, path[j] ?? O))
    }
  return worst
}

describe("spring paths", () => {
  it.each([
    [1, 9, 30, 8],
    [0.5, 5.5, 15, 8],
    [2, 18, 50, 6],
  ])(
    "compression d=%s D=%s: from d/2 to L0 − d/2, coils never closer than a wire",
    (d, D, L0, n) => {
      for (const closed of [0, 1]) {
        const path = compressionPath(D / 2, d, L0, n, closed, 24)
        expect(path[0]?.[1]).toBeCloseTo(d / 2, 12)
        expect(path.at(-1)?.[1]).toBeCloseTo(L0 - d / 2, 9)
        expect(clearance(path, d)).toBeGreaterThanOrEqual(tightPitch(d) - 1e-9)
      }
    }
  )

  it.each([
    [0.8, 7.2, 20],
    [0.6, 5.4, 15],
    [1.5, 14.5, 25],
    [2, 6, 3],
  ])(
    "extension d=%s D=%s: loops clear the coils by a wire (regression: they cut through)",
    (d, D, turns) => {
      const { path } = extensionPath(D / 2, d, turns, 24)
      expect(clearance(path, d)).toBeGreaterThanOrEqual(d)
    }
  )
})

describe("formulas (PLAN §2)", () => {
  it("helical spring rate k = G d⁴ / (8 D³ n)", () => {
    // Music wire d = 1 mm, D = 9 mm, 8 active coils: 81.7e9 · 1e-12 / (8 · 7.29e-7 · 8) N/m.
    expect(springRate(SPRING_WIRE.music.G, 1, 9, 8)).toBeCloseTo(1751.1, 1)
    // Doubling the wire multiplies the rate by 16; doubling the coil divides it by 8.
    const k = springRate(70e9, 1, 10, 10)
    expect(springRate(70e9, 2, 10, 10) / k).toBeCloseTo(16, 12)
    expect(springRate(70e9, 1, 20, 10) / k).toBeCloseTo(1 / 8, 12)
  })

  it("lead screw v = L ω / (2π)", () => {
    expect(leadSpeed(8, 2 * Math.PI)).toBeCloseTo(8, 12) // one turn a second: one lead a second
    expect(leadSpeed(2, Math.PI)).toBeCloseTo(1, 12)
  })
})
