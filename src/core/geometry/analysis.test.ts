import { describe, expect, it } from "vitest"
import { eigenSymmetric3 } from "@/core/math/eigen3"
import { classifyFaces } from "./classify"
import { creasedNormals } from "./creasedNormals"
import { volumeAndCentroid } from "./massProperties"
import { growFaces, orderByFace } from "./segment"
import { boxMesh, cylinderSoup, rotateMesh, soup } from "./testing/shapes"
import { buildTopology, isWatertight } from "./topology"
import { weldVertices } from "./weld"

const deg = (rad: number) => (rad * 180) / Math.PI
const angleBetween = (a: number[], b: number[]) => {
  const d = Math.abs(
    (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0)
  )
  return deg(Math.acos(Math.min(1, d / (Math.hypot(...a) * Math.hypot(...b)))))
}
/** Some tilted axis: rotate +Z by 37° about a skew axis. */
const tilt = (() => {
  const axis = [1, 2, -0.5]
  const l = Math.hypot(...axis)
  const s = Math.sin((37 * Math.PI) / 360)
  return [
    (axis[0] ?? 0) * (s / l),
    (axis[1] ?? 0) * (s / l),
    (axis[2] ?? 0) * (s / l),
    Math.cos((37 * Math.PI) / 360),
  ] as [number, number, number, number]
})()

function analyse(mesh = cylinderSoup(5, 20, 32)) {
  const smooth = creasedNormals(mesh)
  const { faceOf, count } = growFaces(smooth)
  const { indices, ranges } = orderByFace(smooth.indices, faceOf, count)
  const ordered = { ...smooth, indices }
  return { mesh: ordered, faces: classifyFaces(ordered, ranges) }
}

describe("mass properties and topology", () => {
  it("unit cube: volume 1 mm³, centroid at the origin, watertight", () => {
    const cube = boxMesh(1, 1, 1)
    const { volumeMm3, centroidMm } = volumeAndCentroid(cube)
    expect(volumeMm3).toBeCloseTo(1, 12)
    centroidMm.forEach((c) => expect(c).toBeCloseTo(0, 12))
    expect(isWatertight(buildTopology(cube))).toBe(true)
  })

  it("a box 10 x 20 x 30 has volume 6000 mm³; an open or flipped one is not watertight", () => {
    const box = boxMesh(10, 20, 30)
    expect(volumeAndCentroid(box).volumeMm3).toBeCloseTo(6000, 9)
    const open = { ...box, indices: box.indices.slice(3) }
    expect(isWatertight(buildTopology(open))).toBe(false)
    const flipped = box.indices.slice()
    flipped.set([flipped[1] ?? 0, flipped[0] ?? 0], 0)
    expect(isWatertight(buildTopology({ ...box, indices: flipped }))).toBe(false)
  })

  it("welds an STL-style triangle soup", () => {
    const cyl = cylinderSoup(5, 20, 32)
    expect(weldVertices(cyl.positions).count).toBe(2 * 32 + 2)
    expect(isWatertight(buildTopology(cyl))).toBe(true)
  })
})

describe("normals, faces and classification", () => {
  it("smooths the cylinder side and keeps the rim edges sharp", () => {
    const smooth = creasedNormals(cylinderSoup(5, 20, 32))
    // side: one smooth ring per rim (2 x 32), caps: their own normals (2 x 32) + 2 centres
    expect(smooth.positions.length / 3).toBe(4 * 32 + 2)
  })

  it("finds 6 planar faces on a box with outward normals", () => {
    const { faces } = analyse(
      soup(
        Array.from(boxMesh(4, 6, 8).indices, (i) => [
          ...boxMesh(4, 6, 8).positions.subarray(3 * i, 3 * i + 3),
        ]).flat()
      )
    )
    expect(faces).toHaveLength(6)
    expect(faces.every((f) => f.kind === "plane")).toBe(true)
    const normals = faces.map((f) => f.normal?.map((x) => Math.round(x)).join(","))
    expect(new Set(normals)).toEqual(
      new Set(["1,0,0", "-1,0,0", "0,1,0", "0,-1,0", "0,0,1", "0,0,-1"])
    )
  })

  it("PLAN 4.10: a tilted 32-segment cylinder gives its axis within 0.1° and its radius", () => {
    const { faces } = analyse(rotateMesh(cylinderSoup(5, 20, 32), tilt))
    const side = faces.find((f) => f.kind === "cylinder")
    if (!side?.axis) throw new Error("no cylinder found")
    const truth = rotateMesh(
      {
        positions: new Float32Array([0, 0, 1]),
        normals: new Float32Array(3),
        indices: new Uint32Array(),
      },
      tilt
    ).positions
    expect(angleBetween(side.axis, [...truth])).toBeLessThan(0.1)
    expect(side.radiusMm).toBeCloseTo(5, 3)
    expect(faces.filter((f) => f.kind === "plane")).toHaveLength(2)
  })

  it("PLAN §2: an arc of angle α gives λ1,2 = ½(1 ± sin α / α)", () => {
    for (const alpha of [Math.PI / 6, Math.PI / 2, Math.PI]) {
      const steps = 2000
      let xx = 0
      let xy = 0
      let yy = 0
      for (let i = 0; i < steps; i++) {
        const t = -alpha / 2 + ((i + 0.5) / steps) * alpha
        xx += Math.cos(t) ** 2 / steps
        xy += (Math.cos(t) * Math.sin(t)) / steps
        yy += Math.sin(t) ** 2 / steps
      }
      const { values } = eigenSymmetric3([xx, xy, 0, yy, 0, 0])
      expect(values[0]).toBeCloseTo(0.5 * (1 + Math.sin(alpha) / alpha), 6)
      expect(values[1]).toBeCloseTo(0.5 * (1 - Math.sin(alpha) / alpha), 6)
      expect(values[2]).toBeCloseTo(0, 12)
    }
  })

  it("reports a 90° arc as a cylinder and fits its radius", () => {
    const { faces } = analyse(cylinderSoup(8, 10, 16, Math.PI / 2))
    expect(faces).toHaveLength(1)
    expect(faces[0]?.kind).toBe("cylinder")
    expect(faces[0]?.radiusMm).toBeCloseTo(8, 3)
  })

  it("PLAN 7.5: a sphere is neither a plane nor a cylinder (no anchor axis from it)", () => {
    const { faces } = analyse(sphereSoup(6, 16, 24))
    expect(faces).toHaveLength(1)
    expect(faces[0]?.kind).toBe("other")
  })
})

/** UV sphere as an STL would give it, `rings` from pole to pole and `segments` around. */
function sphereSoup(radius: number, rings: number, segments: number) {
  const at = (i: number, j: number): [number, number, number] => {
    const t = (i / rings) * Math.PI
    const p = (j / segments) * 2 * Math.PI
    const r = radius * Math.sin(t)
    return [r * Math.cos(p), r * Math.sin(p), radius * Math.cos(t)]
  }
  const positions: number[] = []
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segments; j++) {
      const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]
      if (i > 0) positions.push(...a, ...b, ...d) // no sliver at the north pole
      if (i < rings - 1) positions.push(...b, ...c, ...d) // nor at the south pole
    }
  return soup(positions)
}
