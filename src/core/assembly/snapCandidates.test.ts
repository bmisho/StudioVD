import { describe, expect, it } from "vitest"
import { classifyFaces } from "@/core/geometry/classify"
import type { FaceInfo } from "@/core/geometry/meshData"
import { snapFeatures, type SnapFeatures } from "@/core/geometry/snapFeatures"
import { boxMesh } from "@/core/geometry/testing/shapes"
import type { Vec3 } from "@/core/schema"
import { faceOfTriangle, snapCandidate, type SnapQuery } from "./snapCandidates"

// A 10 x 20 x 30 mm box seen from +z, orthographic, 10 px per mm, its centre at (100, 100).
const box = boxMesh(10, 20, 30)
const boxFaces = classifyFaces(
  box,
  [0, 1, 2, 3, 4, 5].map((f) => ({ first: 2 * f, last: 2 * f + 1 }))
)
const boxFeatures = snapFeatures(box, boxFaces)
const front = boxFaces.findIndex((f) => (f.normal?.[2] ?? 0) > 0.99)
/** Within 1e-9 mm: face centroids carry rounding. */
const near = (v: Vec3): unknown[] => v.map((x): unknown => expect.closeTo(x, 9))
const fromFront = (p: Vec3) => ({ x: 100 + 10 * p[0], y: 100 - 10 * p[1] })

/** The cursor over `point` of the box's +z face. */
function onFront(point: Vec3, pxPerMm = 10): SnapQuery {
  const toScreen = (p: Vec3) => ({ x: 100 + pxPerMm * p[0], y: 100 - pxPerMm * p[1] })
  return {
    point,
    normal: [0, 0, 1],
    triangle: boxFaces[front]?.first ?? 0,
    toViewer: [0, 0, 1],
    faces: boxFaces,
    features: boxFeatures,
    toScreen,
    cursor: toScreen(point),
  }
}

describe("anchor snap candidates", () => {
  it("snaps to a corner of the face under the cursor, as a point with the face normal", () => {
    const c = snapCandidate(onFront([4.6, 9.6, 15]))
    expect(c).toMatchObject({ snap: "corner", kind: "point", name: "Vertex" })
    expect(c.frame).toEqual({ originMm: [5, 10, 15], z: [0, 0, 1], x: [1, 0, 0] })
    expect(c.source.kind).toBe("vertex")
  })

  it("snaps to an edge midpoint, x along the edge", () => {
    const c = snapCandidate(onFront([0.3, 9.5, 15]))
    expect(c.snap).toBe("edgeMid")
    expect(c.frame.originMm).toEqual([0, 10, 15])
    expect(c.frame.x.map(Math.abs)).toEqual([1, 0, 0])
    expect(c.feature).toMatchObject({ type: "segment" })
    expect(c.source).toEqual({ kind: "face", faceIndex: front })
  })

  it("snaps to the face centre, else places on the face where the cursor is", () => {
    expect(snapCandidate(onFront([0.5, 0.5, 15]))).toMatchObject({
      snap: "faceCentre",
      kind: "planar",
      frame: { originMm: near([0, 0, 15]), z: [0, 0, 1], x: [1, 0, 0] },
    })
    expect(snapCandidate(onFront([2, 4, 15]))).toMatchObject({
      snap: "face",
      kind: "planar",
      name: "Face",
      frame: { originMm: near([2, 4, 15]), z: [0, 0, 1], x: [1, 0, 0] },
    })
  })

  it("prefers a corner to an edge midpoint when both are within reach", () => {
    // At 1 px per mm the whole face is 10 x 20 px: everything is close.
    expect(snapCandidate(onFront([3, 8, 15], 1)).snap).toBe("corner")
    expect(fromFront([0, 0, 0])).toEqual({ x: 100, y: 100 })
  })
})

describe("anchor snap candidates on a hole", () => {
  // A top face (y = 4) around a Ø8 hole at x = 5, z = 0, and the hole's wall.
  const faces: FaceInfo[] = [
    { first: 0, last: 0, kind: "plane", normal: [0, 1, 0], point: [0, 4, 0] },
    { first: 1, last: 1, kind: "cylinder", axis: [0, 1, 0], point: [5, 0, 0], radiusMm: 4 },
  ]
  const features: SnapFeatures = {
    corners: [],
    edges: [
      { kind: "arc", faces: [0, 1], centre: [5, 4, 0], axis: [0, 1, 0], radius: 4, closed: false },
    ],
    cylinderSense: Int8Array.from([0, -1]),
  }
  const query = (
    point: Vec3,
    triangle: number,
    toScreen: SnapQuery["toScreen"],
    toViewer: Vec3
  ) => ({
    point,
    normal: triangle === 0 ? ([0, 1, 0] as Vec3) : ([0, 0, -1] as Vec3),
    triangle,
    toViewer,
    faces,
    features,
    toScreen,
    cursor: toScreen(point),
  })

  it("near the rim on the face around it: the hole's axis at its mouth, out of the face", () => {
    const fromAbove = (p: Vec3) => ({ x: 100 + 10 * p[0], y: 100 + 10 * p[2] })
    const c = snapCandidate(query([9.3, 4, 0.5], 0, fromAbove, [0, 1, 0]))
    expect(c).toMatchObject({ snap: "circle", kind: "axial", name: "Hole Ø8" })
    expect(c.frame).toEqual({ originMm: [5, 4, 0], z: [0, 1, 0], x: [1, 0, 0] })
    expect(c.source).toEqual({ kind: "face", faceIndex: 1 }) // the hole's face
    expect(c.feature).toMatchObject({ type: "circle", radius: 4 })
  })

  it("on the wall away from the rims: the axis at the depth of the cursor", () => {
    const fromFront2 = (p: Vec3) => ({ x: 100 + 10 * p[0], y: 100 - 10 * p[1] })
    const c = snapCandidate(query([5, 0, 4], 1, fromFront2, [0, 0, 1]))
    expect(c).toMatchObject({ snap: "axis", kind: "axial", hint: "Hole Ø8 axis" })
    expect(c.frame.originMm).toEqual([5, 0, 0])
    expect(c.frame.z).toEqual([0, 1, 0])
  })
})

describe("faceOfTriangle", () => {
  it("finds the face holding a triangle, -1 outside every face", () => {
    const faces = [
      { first: 0, last: 1 },
      { first: 2, last: 5 },
      { first: 8, last: 8 },
    ].map((r) => ({ ...r, kind: "other" as const }))
    expect([0, 1, 3, 5, 6, 8, 9].map((t) => faceOfTriangle(faces, t))).toEqual([
      0, 0, 1, 1, -1, 2, -1,
    ])
  })
})
