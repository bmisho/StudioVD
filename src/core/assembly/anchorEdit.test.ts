import { describe, expect, it } from "vitest"
import { cross, dot, length } from "@/core/math/vec3"
import { AnchorSchema, MAX_COORDINATE_MM, newId, type Frame } from "@/core/schema"
import { axisOf, moveAlong, pointAlong, quarterTurn } from "./anchorEdit"

const frame: Frame = { originMm: [10, 2, -3], z: [0, 1, 0], x: [1, 0, 0] }

/** Unit axes, square to each other: what the schema asks of a frame. */
function expectOrthonormal(f: Frame) {
  expect(length(f.z)).toBeCloseTo(1, 12)
  expect(length(f.x)).toBeCloseTo(1, 12)
  expect(dot(f.z, f.x)).toBeCloseTo(0, 12)
  const anchor = {
    id: newId(),
    partId: newId(),
    kind: "point",
    frame: f,
    source: { kind: "manual" },
  }
  expect(AnchorSchema.safeParse(anchor).success).toBe(true)
}

describe("positioning an anchor from the inspector", () => {
  it("points it along a part axis, keeping its origin and, where it can, its x", () => {
    const down = pointAlong(frame, "-Y")
    expect(down).toEqual({ originMm: [10, 2, -3], z: [0, -1, 0], x: [1, 0, 0] })
    // x was along +X: pointing along X itself, x takes the least aligned axis (Y).
    const side = pointAlong(frame, "+X")
    expect(side.z).toEqual([1, 0, 0])
    expect(side.x).toEqual([0, 1, 0])
    for (const axis of ["+X", "-X", "+Y", "-Y", "+Z", "-Z"] as const)
      expectOrthonormal(pointAlong(frame, axis))
    expect(axisOf(down)).toBe("-Y")
    expect(axisOf({ ...frame, z: [0, Math.SQRT1_2, Math.SQRT1_2] })).toBeNull()
  })

  it("turns it a quarter about its direction, four times round to where it was", () => {
    const once = quarterTurn(frame)
    expect(once.x).toEqual(cross(frame.z, frame.x))
    expect(once.z).toEqual(frame.z)
    expectOrthonormal(once)
    expect(quarterTurn(quarterTurn(quarterTurn(once)))).toEqual(frame)
  })

  it("moves it along its direction, within the file's coordinate range", () => {
    expect(moveAlong(frame, 2.5)?.originMm).toEqual([10, 4.5, -3])
    expect(moveAlong(frame, -2)?.originMm).toEqual([10, 0, -3])
    expect(moveAlong(frame, MAX_COORDINATE_MM)).toBeNull()
    expect(moveAlong(frame, Number.NaN)).toBeNull()
  })
})
