// @vitest-environment node
import { describe, expect, it } from "vitest"
import { DEFAULT_WELD_TOLERANCE_MM, weldVertices } from "./weld"

/** Inverse of an odd number modulo 2^32 (Newton's iteration). */
function inverse(a: number): number {
  let x = a
  for (let i = 0; i < 5; i++) x = Math.imul(x, 2 - Math.imul(a, x))
  return x
}

/**
 * Vertices in `count` different cells that all share one cell hash under a fixed hash
 * (x * 73856093 ^ z * 83492791, y = 0): what a crafted file would aim for.
 */
function collidingVertices(count: number): Float32Array {
  const inv = inverse(83492791)
  const out: number[] = []
  for (let cx = 0; out.length < 3 * count && cx < 1e8; cx++) {
    const cz = Math.imul(inv, Math.imul(cx, 73856093) ^ 0x5bd1e995) // same hash for all
    if (Math.abs(cz) > 5_000_000) continue // |z| < 500 mm: float32 still lands in the cell
    const t = DEFAULT_WELD_TOLERANCE_MM
    out.push((cx + 0.5) * t, 0.5 * t, (cz + 0.5) * t)
  }
  return new Float32Array(out)
}

describe("vertex weld", () => {
  it("merges within the tolerance, across cell boundaries, in first-seen order", () => {
    const t = DEFAULT_WELD_TOLERANCE_MM
    const p = new Float32Array([0, 0, 0, 5, 5, 5, 0.4 * t, 0, 0, 5 + 0.9 * t, 5, 5, 1, 0, 0])
    expect(weldVertices(p)).toEqual({ ids: Uint32Array.from([0, 1, 0, 1, 2]), count: 3 })
  })

  it("stays fast when a file packs its vertices into cells of one fixed hash", () => {
    const positions = collidingVertices(60_000)
    expect(positions.length).toBe(180_000)
    const start = performance.now()
    const { count } = weldVertices(positions)
    expect(count).toBe(60_000) // all far apart
    expect(performance.now() - start).toBeLessThan(1500) // quadratic: about 4 s; this: about 0.1 s
  })
})
