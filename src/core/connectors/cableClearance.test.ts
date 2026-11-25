import { describe, expect, it } from "vitest"
import { length, sub } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"
import { clearOfParts, pinnedPoints, type ClearPoint } from "./cableClearance"

/** A solid slab y < 0 (a base plate): points closer than r are lifted to y = r. */
const floor: ClearPoint = (p, r) => (p[1] < r - 1e-9 ? [p[0], r, p[2]] : null)

/** A cable from (0, 5, 0) to (100, 5, 0) sagging into the floor, in 1 mm steps. */
const sagging = (): Vec3[] =>
  Array.from({ length: 101 }, (_, i) => [i, 5 - 12 * Math.sin((Math.PI * i) / 100), 0])

const pathLength = (ps: readonly Vec3[]) =>
  ps.slice(1).reduce((s, q, i) => s + length(sub(q, ps[i] ?? q)), 0)

describe("cables clear of parts (0.2.2)", () => {
  it("leaves a cable that touches nothing exactly as laid", () => {
    const high: Vec3[] = sagging().map(([x, y, z]) => [x, y + 20, z])
    expect(clearOfParts(high, 1, () => false, floor)).toEqual(high)
  })

  it("lifts what dips into a part onto its surface, ends and waypoints fixed", () => {
    const laid = sagging()
    const fixed = pinnedPoints(laid, 3, [], 0.5)
    const out = clearOfParts(laid, 1, fixed, floor)
    for (const [, y] of out) expect(y).toBeGreaterThanOrEqual(1 - 1e-9)
    expect(out[0]).toEqual(laid[0])
    expect(out.at(-1)).toEqual(laid.at(-1))
    expect(out[2]).toEqual(laid[2]) // within the 3 mm lead
    // The spare goes sideways and along the floor rather than through it: about its length.
    expect(pathLength(out)).toBeGreaterThan(pathLength(laid) * 0.9)
  })

  it("pins the points nearest the waypoints and the leads", () => {
    const line: Vec3[] = Array.from({ length: 11 }, (_, i) => [i * 10, 0, 0])
    const fixed = pinnedPoints(line, 10, [[49, 0.2, 0]], 2)
    expect([0, 1, 5, 9, 10].every(fixed)).toBe(true)
    expect([2, 3, 4, 6, 7, 8].some(fixed)).toBe(false)
  })
})
