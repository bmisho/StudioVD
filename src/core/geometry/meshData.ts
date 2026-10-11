import type { Vec3 } from "@/core/schema"

/**
 * Indexed triangle mesh in plain typed arrays (transferable to and from workers, no three.js).
 * Millimetres. Every array is tightly packed: 3 floats per vertex, 3 indices per triangle.
 */
export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  /** Optional per-vertex colour, linear RGB 0..1 (STEP per-face colours). */
  colors?: Float32Array
}

/** Surface kinds found by face classification (PLAN §2). */
export type FaceKind = "plane" | "cylinder" | "other"

/**
 * A face: a contiguous triangle range (inclusive, as occt's `brep_faces`) after the index
 * buffer has been ordered by face. Planes carry their unit normal and a point; cylinders their
 * unit axis, a point on the axis and the radius (mm). Used by Phase 7 anchor snapping.
 */
export interface FaceInfo {
  first: number
  last: number
  kind: FaceKind
  normal?: Vec3
  axis?: Vec3
  point?: Vec3
  radiusMm?: number
}

export interface Bounds {
  min: Vec3
  max: Vec3
}

export const vertexCount = (mesh: MeshData): number => mesh.positions.length / 3
export const triangleCount = (mesh: MeshData): number => mesh.indices.length / 3

/** Axis-aligned bounds of the vertices actually used by triangles. Empty mesh -> zeros. */
export function meshBounds(mesh: MeshData): Bounds {
  const p = mesh.positions
  if (mesh.indices.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] }
  let [x0, y0, z0, x1, y1, z1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  for (const i of mesh.indices) {
    const x = p[3 * i] ?? 0
    const y = p[3 * i + 1] ?? 0
    const z = p[3 * i + 2] ?? 0
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    z0 = Math.min(z0, z)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
    z1 = Math.max(z1, z)
  }
  return { min: [x0, y0, z0], max: [x1, y1, z1] }
}

/** Throws if the arrays are inconsistent (lengths, index range, non-finite values). */
export function assertValidMesh(mesh: MeshData): void {
  const n = vertexCount(mesh)
  if (!Number.isInteger(n)) throw new Error("positions length is not a multiple of 3")
  if (mesh.normals.length !== mesh.positions.length) throw new Error("normals length mismatch")
  if (mesh.colors && mesh.colors.length !== mesh.positions.length) {
    throw new Error("colors length mismatch")
  }
  if (mesh.indices.length % 3 !== 0) throw new Error("indices length is not a multiple of 3")
  for (const i of mesh.indices) if (i >= n) throw new Error(`index ${i} out of range (${n})`)
  for (const v of mesh.positions) if (!Number.isFinite(v)) throw new Error("non-finite position")
  for (const v of mesh.normals) if (!Number.isFinite(v)) throw new Error("non-finite normal")
}
