import { describe, expect, it } from "vitest"
import type { Vec3 } from "@/core/schema"
import { cylinderSenses } from "./cylinderSense"
import type { FaceInfo } from "./meshData"

/** The side of a cylinder about +z (r 5, 16 facets), facing out or (flipped) in. */
function side(flip: boolean) {
  const ring = (z: number) =>
    Array.from({ length: 16 }, (_, i): Vec3 => {
      const a = (2 * Math.PI * i) / 16
      return [5 * Math.cos(a), 5 * Math.sin(a), z]
    })
  const positions = [...ring(0), ...ring(10)].flat()
  const tri = (a: number, b: number, c: number) => (flip ? [a, c, b] : [a, b, c])
  const indices = Array.from({ length: 16 }, (_, i) => {
    const j = (i + 1) % 16
    return [...tri(i, j, 16 + j), ...tri(i, 16 + j, 16 + i)]
  }).flat()
  // A zero-area sliver first, as tessellators leave them: it must not decide the sense.
  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from([0, 0, 0, ...indices]),
  }
}

const face: FaceInfo = {
  first: 0,
  last: 32,
  kind: "cylinder",
  axis: [0, 0, 1],
  point: [0, 0, 0],
  radiusMm: 5,
}

describe("cylinder sense", () => {
  it("is a shaft when the side faces out, a hole when it faces in, over the whole face", () => {
    expect([...cylinderSenses(side(false), [face])]).toEqual([1])
    expect([...cylinderSenses(side(true), [face])]).toEqual([-1])
  })

  it("reads no triangle past the mesh (a face range from a crafted file)", () => {
    expect([...cylinderSenses(side(false), [{ ...face, last: 2 ** 31 }])]).toEqual([1])
  })
})
