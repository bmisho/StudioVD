import { fitCircle } from "@/core/math/circleFit"
import { eigenSymmetric3, type Sym3 } from "@/core/math/eigen3"
import type { Vec3 } from "@/core/schema"
import { faceNormals } from "./creasedNormals"
import type { FaceInfo, MeshData } from "./meshData"

/** Eigenvalue below which the normal spread in that direction counts as zero. */
const FLAT = 1e-5
/** Accept a cylinder when the vertices sit this close to the fitted circle (relative). */
const CIRCLE_TOLERANCE = 1e-3

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
/** Deterministic sign for an axis: largest component positive. */
function canonical(v: Vec3): Vec3 {
  const big = v.reduce((m, x, i) => (Math.abs(x) > Math.abs(v[m] ?? 0) ? i : m), 0)
  return (v[big] ?? 0) < 0 ? [-v[0], -v[1], -v[2]] : v
}

/**
 * Classifies faces (PLAN §2). With area-weighted unit normals, N = Σ A n nᵀ / Σ A has
 * eigenvalues λ1 ≥ λ2 ≥ λ3 summing to 1: a plane has λ2 ≈ 0 (normal = e1); a cylinder has
 * λ3 ≈ 0 (axis = e3, every normal is perpendicular to it) and λ2 > 0. A Kåsa circle fit of
 * the face's vertices in the plane ⟂ axis gives the axis position and radius, and rejects
 * faces whose normals happen to share a perpendicular (tangent blends) but are not round.
 */
export function classifyFaces(mesh: MeshData, ranges: { first: number; last: number }[]) {
  const { unit, weighted } = faceNormals(mesh.positions, mesh.indices)
  const p = mesh.positions
  return ranges.map(({ first, last }): FaceInfo => {
    const n: Sym3 = [0, 0, 0, 0, 0, 0]
    const mean: Vec3 = [0, 0, 0]
    const centroid: Vec3 = [0, 0, 0]
    let area = 0
    const verts = new Set<number>()
    for (let t = first; t <= last; t++) {
      const a =
        Math.hypot(weighted[3 * t] ?? 0, weighted[3 * t + 1] ?? 0, weighted[3 * t + 2] ?? 0) / 2
      const x = unit[3 * t] ?? 0
      const y = unit[3 * t + 1] ?? 0
      const z = unit[3 * t + 2] ?? 0
      n[0] += a * x * x
      n[1] += a * x * y
      n[2] += a * x * z
      n[3] += a * y * y
      n[4] += a * y * z
      n[5] += a * z * z
      mean[0] += a * x
      mean[1] += a * y
      mean[2] += a * z
      area += a
      for (let k = 0; k < 3; k++) {
        const v = mesh.indices[3 * t + k] ?? 0
        verts.add(v)
        for (let c = 0; c < 3; c++) centroid[c] = (centroid[c] ?? 0) + (a / 3) * (p[3 * v + c] ?? 0)
      }
    }
    if (area <= 0) return { first, last, kind: "other" }
    const { values, vectors } = eigenSymmetric3(n.map((x) => x / area) as Sym3)
    const point: Vec3 = [centroid[0] / area, centroid[1] / area, centroid[2] / area]
    if (values[1] < FLAT) {
      const e1 = vectors[0]
      const normal: Vec3 = dot(e1, mean) < 0 ? [-e1[0], -e1[1], -e1[2]] : e1
      return { first, last, kind: "plane", normal, point }
    }
    if (values[2] < FLAT) return cylinder(first, last, canonical(vectors[2]), [...verts], p)
    return { first, last, kind: "other" }
  })
}

function cylinder(
  first: number,
  last: number,
  axis: Vec3,
  verts: number[],
  p: Float32Array
): FaceInfo {
  // Orthonormal basis (u, w) of the plane perpendicular to the axis.
  const helper: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u0: Vec3 = [
    helper[1] * axis[2] - helper[2] * axis[1],
    helper[2] * axis[0] - helper[0] * axis[2],
    helper[0] * axis[1] - helper[1] * axis[0],
  ]
  const ul = Math.hypot(...u0)
  const u: Vec3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul]
  const w: Vec3 = [
    axis[1] * u[2] - axis[2] * u[1],
    axis[2] * u[0] - axis[0] * u[2],
    axis[0] * u[1] - axis[1] * u[0],
  ]
  const xs: number[] = []
  const ys: number[] = []
  let along = 0
  for (const v of verts) {
    const q: Vec3 = [p[3 * v] ?? 0, p[3 * v + 1] ?? 0, p[3 * v + 2] ?? 0]
    xs.push(dot(q, u))
    ys.push(dot(q, w))
    along += dot(q, axis)
  }
  const circle = fitCircle(xs, ys)
  if (!circle || circle.rms > CIRCLE_TOLERANCE * circle.r + 1e-4)
    return { first, last, kind: "other" }
  const h = along / verts.length
  const point: Vec3 = [0, 1, 2].map(
    (k) => circle.cx * (u[k] ?? 0) + circle.cy * (w[k] ?? 0) + h * (axis[k] ?? 0)
  ) as Vec3
  return { first, last, kind: "cylinder", axis, point, radiusMm: circle.r }
}
