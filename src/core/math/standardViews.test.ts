import { Spherical, Vector3 } from "three"
import { describe, expect, it } from "vitest"
import {
  STANDARD_VIEW_DIRECTIONS,
  cubeHitDirection,
  nearestAzimuth,
  orbitAnglesFor,
  type StandardView,
} from "./standardViews"

const close = (a: number, b: number, eps = 1e-12) => expect(Math.abs(a - b)).toBeLessThan(eps)

describe("orbitAnglesFor", () => {
  it("maps the standard views", () => {
    const angles = (v: StandardView) => orbitAnglesFor(STANDARD_VIEW_DIRECTIONS[v])
    expect(angles("front")).toEqual({ azimuth: 0, polar: Math.PI / 2 })
    close(angles("right").azimuth, Math.PI / 2)
    close(angles("left").azimuth, -Math.PI / 2)
    close(Math.abs(angles("back").azimuth), Math.PI)
    expect(angles("top")).toEqual({ azimuth: 0, polar: 0 })
    expect(angles("bottom")).toEqual({ azimuth: 0, polar: Math.PI })
    close(angles("isometric").azimuth, Math.PI / 4)
    close(angles("isometric").polar, Math.acos(1 / Math.sqrt(3))) // 0.9553166181
  })

  it("agrees with three's Spherical, which camera-controls uses", () => {
    for (const d of [
      [0.3, 0.5, -0.8],
      [-1, 0.2, 0.1],
      [0.01, -0.9, 0.4],
    ] as const) {
      const s = new Spherical().setFromVector3(new Vector3(...d))
      const a = orbitAnglesFor(d)
      close(a.azimuth, s.theta, 1e-12)
      close(a.polar, s.phi, 1e-12)
    }
  })
})

describe("nearestAzimuth", () => {
  it("turns the short way regardless of winding", () => {
    close(nearestAzimuth(6, 0), 2 * Math.PI)
    close(nearestAzimuth(-3, 3), 3 - 2 * Math.PI)
    const wound = (3 * Math.PI) / 2 + 4 * Math.PI
    close(nearestAzimuth(wound, 0) - wound, Math.PI / 2, 1e-9)
  })
})

describe("cubeHitDirection", () => {
  it("uses the face normal for faces and the position for edges and corners", () => {
    expect(cubeHitDirection([0, 0, 0], [0, 1, 0])).toEqual([0, 1, 0])
    const edge = cubeHitDirection([0.38, 0.38, 0], null)
    close(edge?.[0] ?? 0, Math.SQRT1_2)
    close(edge?.[2] ?? 1, 0)
    const corner = cubeHitDirection([0.38, 0.38, 0.38], null)
    close(corner?.[1] ?? 0, 1 / Math.sqrt(3))
    expect(cubeHitDirection([0, 0, 0], null)).toBeNull()
  })
})
