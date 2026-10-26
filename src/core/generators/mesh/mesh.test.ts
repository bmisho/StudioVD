import { describe, expect, it } from "vitest"
import { volumeAndCentroid } from "@/core/geometry/massProperties"
import { buildTopology, isWatertight } from "@/core/geometry/topology"
import { BodyBuilder, type BodyMesh } from "./builder"
import {
  circle,
  outlinePoints,
  polygon,
  rectangle,
  roundedRect,
  shifted,
  smoothRuns,
} from "./outline"
import { extrude, wall } from "./prism"
import { revolve, revolvedVolume } from "./revolve"

const closed = (m: BodyMesh) => isWatertight(buildTopology({ ...m }))
const volume = (m: BodyMesh) => volumeAndCentroid({ ...m }).volumeMm3

describe("body meshes", () => {
  it("extrudes a box into six flat faces with outward normals and its exact volume", () => {
    const b = new BodyBuilder()
    extrude(b, rectangle(4, 2), [], 0, 3)
    const m = b.build()
    expect(m.faceRanges).toHaveLength(6)
    expect(closed(m)).toBe(true)
    expect(volume(m)).toBeCloseTo(24, 9)
    for (let i = 0; i < m.normals.length; i += 3) {
      const n = [m.normals[i] ?? 0, m.normals[i + 1] ?? 0, m.normals[i + 2] ?? 0]
      expect(n.filter((c) => Math.abs(c) > 1e-9)).toHaveLength(1) // axis-aligned per face
    }
  })

  it("faces outward whichever way the outline runs", () => {
    const b = new BodyBuilder()
    const cw = [polygon([...outlinePoints(rectangle(4, 2))].reverse())].flat()
    extrude(b, cw, [], 0, 3)
    expect(volume(b.build())).toBeCloseTo(24, 9)
  })

  it("closes a plate whose holes line up corner to corner (regression: earcut merged them, cracking the cap)", () => {
    const holes = Array.from({ length: 2 * 10 }, (_, i) =>
      shifted(rectangle(1, 1), (Math.floor(i / 2) - 4.5) * 2.54, (i % 2 ? 1 : -1) * 1.27)
    )
    const b = new BodyBuilder()
    extrude(b, rectangle(25.4, 5.08), holes, 0, 2)
    const m = b.build()
    expect(closed(m)).toBe(true)
    expect(volume(m)).toBeCloseTo((25.4 * 5.08 - 20) * 2, 3) // float32 positions
  })

  it("revolves a profile into rings that weld to caps made from the same circle", () => {
    const [r, R, h, n] = [2, 5, 3, 32]
    const b = new BodyBuilder()
    revolve(
      b,
      [
        [
          [r, 0],
          [R, 0],
        ],
        [
          [R, 0],
          [R, h],
        ],
        [
          [R, h],
          [r, h],
        ],
      ],
      n
    )
    // The bore as a hole's wall from circle(r, n): it must meet the rings exactly.
    wall(b, circle(r, n), 0, circle(r, n), h, false)
    const m = b.build()
    expect(closed(m)).toBe(true)
    const exact = Math.PI * (R * R - r * r) * h
    expect(
      revolvedVolume([
        [r, 0],
        [R, 0],
        [R, h],
        [r, h],
      ])
    ).toBeCloseTo(exact, 9)
    const ngon = (n * Math.sin((2 * Math.PI) / n)) / (2 * Math.PI)
    expect(volume(m)).toBeCloseTo(exact * ngon, 3)
  })

  it("splits outlines into smooth runs at corners only", () => {
    expect(smoothRuns(outlinePoints(rectangle(2, 2)))).toHaveLength(4)
    expect(smoothRuns(outlinePoints(circle(5, 48)))).toHaveLength(1)
    expect(smoothRuns(outlinePoints(roundedRect(10, 6, 2, 6)), 30)).toHaveLength(1)
    expect(roundedRect(10, 6, 2, 6)).toHaveLength(8) // as built: sides and arcs apart
  })
})
