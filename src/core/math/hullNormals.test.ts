import { BoxGeometry } from "three"
import { describe, expect, it } from "vitest"
import { computeHullNormals } from "./hullNormals"

function lengths(n: Float32Array): number[] {
  const out: number[] = []
  for (let i = 0; i < n.length; i += 3)
    out.push(Math.hypot(n[i] ?? 0, n[i + 1] ?? 0, n[i + 2] ?? 0))
  return out
}

describe("computeHullNormals", () => {
  const box = new BoxGeometry(2, 4, 6)
  const positions = box.getAttribute("position").array
  const index = box.index?.array ?? null

  it("gives every box corner the diagonal (±1, ±1, ±1)/√3, whatever the split normals", () => {
    const n = computeHullNormals(positions, index, null)
    for (let v = 0; v < n.length / 3; v++) {
      for (let k = 0; k < 3; k++) {
        const p = positions[3 * v + k] ?? 0
        expect(n[3 * v + k]).toBeCloseTo(Math.sign(p) / Math.sqrt(3), 6)
      }
    }
  })

  it("does not depend on indexing (same result for the non-indexed copy)", () => {
    const flat = box.toNonIndexed()
    const n = computeHullNormals(flat.getAttribute("position").array, null, null)
    expect(lengths(n).every((l) => Math.abs(l - 1) < 1e-6)).toBe(true)
    const p = flat.getAttribute("position").array
    expect(n[0]).toBeCloseTo(Math.sign(p[0] ?? 0) / Math.sqrt(3), 6)
  })

  it("skips degenerate triangles", () => {
    // One real triangle plus a zero-area one sharing its first vertex.
    const pos = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const n = computeHullNormals(pos, null, null)
    expect(n[2]).toBeCloseTo(1, 6) // +Z, unaffected by the degenerate triangle
  })

  it("falls back to the render normal where opposite faces cancel (zero-thickness sheet)", () => {
    const pos = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0]
    const fallback = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1]
    const n = computeHullNormals(pos, null, fallback)
    expect([n[2], n[11]]).toEqual([1, -1])
  })

  it("welds vertices closer than the tolerance", () => {
    // Two triangles meeting at a right angle; the shared edge copies are 1e-4 mm apart.
    const pos = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1e-4, 0, 0, 0, 0, 1, 1, 0, 0]
    const n = computeHullNormals(pos, null, null)
    expect(n[0]).toBeCloseTo(n[9] ?? NaN, 6) // welded: same direction
    expect(Math.abs(n[1] ?? 0)).toBeGreaterThan(0.1) // blends both faces
  })
})
