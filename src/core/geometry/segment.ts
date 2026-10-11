import { faceNormals } from "./creasedNormals"
import type { MeshData } from "./meshData"
import { buildTopology, type Topology } from "./topology"

/**
 * Faces for meshes without B-rep data (STL, OBJ, glTF), by normal-angle region growing
 * (PLAN §2): neighbouring triangles join a face while the angle between THEIR normals stays
 * under the threshold, so a tessellated cylinder (11.25° between facets at 32 segments) stays
 * one face and a box splits into six. Tangent blends merge with their neighbours, which the
 * classifier then reports as "other".
 */
export const DEFAULT_REGION_ANGLE_DEG = 40

/** Face id of every triangle, ids 0..count-1 in order of first triangle. */
export function growFaces(
  mesh: MeshData,
  angleDeg = DEFAULT_REGION_ANGLE_DEG,
  { neighbours }: Topology = buildTopology(mesh)
) {
  const t = mesh.indices.length / 3
  const { unit } = faceNormals(mesh.positions, mesh.indices)
  const cos = Math.cos((angleDeg * Math.PI) / 180)
  const faceOf = new Int32Array(t).fill(-1)
  const stack: number[] = []
  let count = 0
  for (let seed = 0; seed < t; seed++) {
    if ((faceOf[seed] ?? 0) >= 0) continue
    faceOf[seed] = count
    stack.push(seed)
    while (stack.length > 0) {
      const a = stack.pop() ?? 0
      for (let e = 0; e < 3; e++) {
        const b = neighbours[3 * a + e] ?? -1
        if (b < 0 || (faceOf[b] ?? 0) >= 0) continue
        const dot =
          (unit[3 * a] ?? 0) * (unit[3 * b] ?? 0) +
          (unit[3 * a + 1] ?? 0) * (unit[3 * b + 1] ?? 0) +
          (unit[3 * a + 2] ?? 0) * (unit[3 * b + 2] ?? 0)
        if (dot < cos) continue
        faceOf[b] = count
        stack.push(b)
      }
    }
    count++
  }
  return { faceOf, count }
}

/**
 * Reorders triangles so each face is one contiguous range (stable within a face) and returns
 * the ranges, inclusive like occt's `brep_faces`. The vertex arrays are untouched.
 */
export function orderByFace(indices: Uint32Array, faceOf: Int32Array, count: number) {
  const t = indices.length / 3
  const sizes = new Uint32Array(count)
  for (let i = 0; i < t; i++) {
    const f = faceOf[i] ?? 0
    sizes[f] = (sizes[f] ?? 0) + 1
  }
  const starts = new Uint32Array(count)
  for (let f = 1; f < count; f++) starts[f] = (starts[f - 1] ?? 0) + (sizes[f - 1] ?? 0)
  const fill = starts.slice()
  const out = new Uint32Array(indices.length)
  for (let i = 0; i < t; i++) {
    const f = faceOf[i] ?? 0
    const slot = fill[f] ?? 0
    fill[f] = slot + 1
    out.set(indices.subarray(3 * i, 3 * i + 3), 3 * slot)
  }
  const ranges = Array.from(starts, (first, f) => ({ first, last: first + (sizes[f] ?? 0) - 1 }))
  return { indices: out, ranges: ranges.filter((r) => r.last >= r.first) }
}
