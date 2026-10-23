import { describe, expect, it } from "vitest"
import { classifyFaces } from "@/core/geometry/classify"
import type { FaceInfo } from "@/core/geometry/meshData"
import { snapFeatures, type SnapArc, type SnapFeatures } from "@/core/geometry/snapFeatures"
import { boxMesh } from "@/core/geometry/testing/shapes"
import type { Vec3 } from "@/core/schema"
import { normalize, signedAngle, sub } from "@/core/math/vec3"
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
      {
        kind: "arc",
        faces: [0, 1],
        centre: [5, 4, 0],
        axis: [0, 1, 0],
        radius: 4,
        closed: true,
        start: [9, 4, 0],
        end: [9, 4, 0],
        sweep: 2 * Math.PI,
      },
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

describe("anchor snap candidates on arcs", () => {
  const fromAbove = (p: Vec3) => ({ x: 100 + 10 * p[0], y: 100 + 10 * p[2] })
  const Y: Vec3 = [0, 1, 0]
  /** An arc in the y = 4 plane about (cx, 4, cz), from `start` to `end` the short way. */
  function arc(faces: [number, number], c: Vec3, r: number, start: Vec3, end: Vec3): SnapArc {
    const sweep = signedAngle(sub(start, c), sub(end, c), Y)
    return { kind: "arc", faces, centre: c, axis: Y, radius: r, closed: false, start, end, sweep }
  }
  function onTop(point: Vec3, arcs: SnapArc[], faces: FaceInfo[]): SnapQuery {
    return {
      point,
      normal: Y,
      triangle: 0,
      toViewer: Y,
      faces,
      features: { corners: [], edges: arcs, cylinderSense: new Int8Array(faces.length) },
      toScreen: fromAbove,
      cursor: fromAbove(point),
    }
  }
  const top: FaceInfo = { first: 0, last: 0, kind: "plane", normal: Y, point: [-40, 4, -40] }
  const wall = (i: number): FaceInfo => ({
    first: i,
    last: i,
    kind: "cylinder",
    axis: Y,
    point: [0, 0, 0],
    radiusMm: 5,
  })

  it("a rounded corner snaps near its arc, not across the circle's missing part", () => {
    const fillet = arc([0, 1], [0, 4, 0], 5, [5, 4, 0], [0, 4, 5])
    const faces = [top, wall(1)]
    expect(snapCandidate(onTop([3.39, 4, 3.39], [fillet], faces)).snap).toBe("circle")
    // 10 mm inside the plate, on the circle where the arc is not: the face, not its centre.
    expect(snapCandidate(onTop([-3.54, 4, -3.54], [fillet], faces)).snap).toBe("face")
  })

  it("a gentle curve offers no centre (R 5000 over a 100 mm chord)", () => {
    const c: Vec3 = [0, 4, 5000]
    const z = 5000 - Math.sqrt(5000 ** 2 - 50 ** 2)
    const gentle = arc([0, 1], c, 5000, [-50, 4, z], [50, 4, z])
    expect(snapCandidate(onTop([0, 4, 0.3], [gentle], [top, wall(1)])).snap).toBe("face")
  })

  it("a rim split in halves: the half beside the cursor is the anchor's source", () => {
    const c: Vec3 = [5, 4, 0]
    const nearHalf = arc([0, 1], c, 4, [9, 4, 0], [1, 4, 0]) // through +z
    nearHalf.sweep = -Math.PI
    const farHalf = arc([0, 2], c, 4, [9, 4, 0], [1, 4, 0]) // through -z
    farHalf.sweep = Math.PI
    const faces = [top, wall(1), wall(2)]
    const s = snapCandidate(onTop([5, 4, 4.5], [nearHalf, farHalf], faces))
    expect(s).toMatchObject({ snap: "circle", source: { kind: "face", faceIndex: 1 } })
  })

  it("a hole's far rim seen from its wall still points out of that mouth", () => {
    const faces: FaceInfo[] = [
      { first: 0, last: 0, kind: "plane", normal: Y, point: [0, 4, 0] },
      { first: 1, last: 1, kind: "plane", normal: [0, -1, 0], point: [0, -4, 0] },
      { first: 2, last: 2, kind: "cylinder", axis: Y, point: [5, 0, 0], radiusMm: 4 },
    ]
    const rim = (face: number, y: number): SnapArc => ({
      ...arc([face, 2], [5, y, 0], 4, [9, y, 0], [9, y, 0]),
      closed: true,
      sweep: 2 * Math.PI,
    })
    const fromFront = (p: Vec3) => ({ x: 100 + 10 * p[0], y: 100 - 10 * p[1] })
    const point: Vec3 = [9, -3.8, 0] // on the wall, just above the bottom rim
    const c = snapCandidate({
      point,
      normal: [-1, 0, 0],
      triangle: 2,
      toViewer: normalize([0.2, 1, 1]),
      faces,
      features: {
        corners: [],
        edges: [rim(0, 4), rim(1, -4)],
        cylinderSense: Int8Array.from([0, 0, -1]),
      },
      toScreen: fromFront,
      cursor: fromFront(point),
    })
    expect(c).toMatchObject({ snap: "circle", name: "Hole Ø8" })
    expect(c.frame.originMm).toEqual([5, -4, 0])
    expect(c.frame.z).toEqual([0, -1, 0])
  })

  it("a mesh too dense for edge snaps says so in the hint", () => {
    const dense: SnapFeatures = { ...boxFeatures, corners: [], edges: [], dense: true }
    const c = snapCandidate({ ...onFront([4.6, 9.6, 15]), features: dense })
    expect(c).toMatchObject({ snap: "face", hint: "Face (too many edges to snap to)" })
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
