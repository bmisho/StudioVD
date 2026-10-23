import { fitCircle } from "@/core/math/circleFit"
import { eigenSymmetric3, type Sym3 } from "@/core/math/eigen3"
import { add, cross, dot, length, normalize, scale, sub } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"
import { edgeChains } from "./edgeChains"
import { featureSegments } from "./featureSegments"
import type { FaceInfo } from "./meshData"

/** Where outline edges meet: a vertex snap (PLAN 7.3). */
export interface SnapCorner {
  at: Vec3
  /** An (unwelded) vertex index there, for the anchor's source. */
  vertex: number
  faces: number[]
}

/** A straight edge: an edge-midpoint snap. */
export interface SnapLine {
  kind: "line"
  faces: [number, number]
  start: Vec3
  end: Vec3
}

/** A circular edge or arc (a hole or shaft rim): a circle-centre snap. */
export interface SnapArc {
  kind: "arc"
  faces: [number, number]
  centre: Vec3
  /** Unit normal of the circle's plane, largest component positive. */
  axis: Vec3
  radius: number
  closed: boolean
}

export type SnapEdge = SnapLine | SnapArc

/** Snap targets of one asset, part-local millimetres; computed once, in the asset worker. */
export interface SnapFeatures {
  corners: SnapCorner[]
  edges: SnapEdge[]
  /** Per face: 1 a convex cylinder (shaft, boss), -1 a concave one (hole), 0 otherwise. */
  cylinderSense: Int8Array
}

/** Deviation allowed from a line or circle, relative to its size (tessellations are exact). */
const RELATIVE_TOLERANCE = 1e-3
const ABSOLUTE_TOLERANCE = 1e-6

/**
 * Corners, straight edges and circular edges of a mesh, from its feature edges (≥ 30°
 * between faces, and borders) joined into chains (PLAN 7.3). A chain that is neither straight
 * nor circular (a spline outline) gives no snap of its own; its corners still do.
 */
export function snapFeatures(
  mesh: { positions: Float32Array; indices: Uint32Array },
  faces: readonly FaceInfo[]
): SnapFeatures {
  const { positions } = mesh
  const point = (v: number): Vec3 => [
    positions[3 * v] ?? 0,
    positions[3 * v + 1] ?? 0,
    positions[3 * v + 2] ?? 0,
  ]
  const { chains, corners } = edgeChains(featureSegments(mesh, faces), positions)
  const edges: SnapEdge[] = []
  for (const chain of chains) {
    const points = chain.vertices.map(point)
    if (chain.closed) points.pop()
    const edge = classifyChain(points, chain.closed, chain.faces)
    if (edge) edges.push(edge)
  }
  return {
    corners: corners.map((c) => ({ at: point(c.vertex), vertex: c.vertex, faces: c.faces })),
    edges,
    cylinderSense: cylinderSenses(mesh, faces),
  }
}

function classifyChain(points: Vec3[], closed: boolean, faces: [number, number]) {
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return null
  if (!closed) {
    const span = sub(last, first)
    const l = length(span)
    const along = scale(span, 1 / l)
    const off = (p: Vec3) => length(cross(sub(p, first), along))
    if (l > 0 && points.every((p) => off(p) <= RELATIVE_TOLERANCE * l + ABSOLUTE_TOLERANCE))
      return { kind: "line", faces, start: first, end: last } satisfies SnapLine
  }
  // An arc needs four points (three always fit a circle); a closed one turns 360°.
  if (points.length < (closed ? 5 : 4)) return null
  const c = scale(
    points.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0] as Vec3),
    1 / points.length
  )
  const m: Sym3 = [0, 0, 0, 0, 0, 0]
  let extent = 0
  for (const p of points) {
    const [x, y, z] = sub(p, c)
    m[0] += x * x
    m[1] += x * y
    m[2] += x * z
    m[3] += y * y
    m[4] += y * z
    m[5] += z * z
    extent = Math.max(extent, Math.hypot(x, y, z))
  }
  const normal = eigenSymmetric3(m).vectors[2]
  const tolerance = RELATIVE_TOLERANCE * extent + ABSOLUTE_TOLERANCE
  if (points.some((p) => Math.abs(dot(sub(p, c), normal)) > tolerance)) return null
  const u = normalize(cross(normal, Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]))
  const w = cross(normal, u)
  const circle = fitCircle(
    points.map((p) => dot(sub(p, c), u)),
    points.map((p) => dot(sub(p, c), w))
  )
  if (!circle || circle.r > extent * 1e3) return null
  if (circle.rms > RELATIVE_TOLERANCE * circle.r + ABSOLUTE_TOLERANCE) return null
  const centre = add(c, add(scale(u, circle.cx), scale(w, circle.cy)))
  return {
    kind: "arc",
    faces,
    centre,
    axis: canonical(normal),
    radius: circle.r,
    closed,
  } satisfies SnapArc
}

/** Deterministic sign for a direction: largest component positive. */
function canonical(v: Vec3): Vec3 {
  const big = v.reduce((m, x, i) => (Math.abs(x) > Math.abs(v[m] ?? 0) ? i : m), 0)
  return (v[big] ?? 0) < 0 ? scale(v, -1) : v
}

/** A cylinder whose face normals point away from its axis is a shaft, towards it a hole. */
function cylinderSenses(
  { positions, indices }: { positions: Float32Array; indices: Uint32Array },
  faces: readonly FaceInfo[]
): Int8Array {
  const sense = new Int8Array(faces.length)
  const at = (i: number): Vec3 => {
    const v = indices[i] ?? 0
    return [positions[3 * v] ?? 0, positions[3 * v + 1] ?? 0, positions[3 * v + 2] ?? 0]
  }
  faces.forEach((face, f) => {
    if (face.kind !== "cylinder" || !face.axis || !face.point) return
    const [a, b, c] = [at(3 * face.first), at(3 * face.first + 1), at(3 * face.first + 2)]
    const n = cross(sub(b, a), sub(c, a))
    const mid = scale([a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]], 1 / 3)
    const off = sub(mid, face.point)
    const radial = sub(off, scale(face.axis, dot(off, face.axis)))
    const d = dot(n, radial)
    sense[f] = d > 0 ? 1 : d < 0 ? -1 : 0
  })
  return sense
}
