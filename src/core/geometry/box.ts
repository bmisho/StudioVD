import type { MeshData } from "./meshData"

/** Axis-aligned box centred at the origin, 24 vertices (split normals), 12 triangles. */
export function boxMesh(sx: number, sy: number, sz: number): MeshData {
  const h = [sx / 2, sy / 2, sz / 2]
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  // For each axis and sign: the face's two in-plane axes (u, v) chosen so u x v = outward normal.
  const faces: [number, number, number, number][] = [
    [0, 1, 1, 2],
    [0, -1, 2, 1],
    [1, 1, 2, 0],
    [1, -1, 0, 2],
    [2, 1, 0, 1],
    [2, -1, 1, 0],
  ]
  for (const [axis, sign, u, v] of faces) {
    const base = positions.length / 3
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const p = [0, 0, 0]
      const n = [0, 0, 0]
      p[axis] = sign * (h[axis] ?? 0)
      p[u] = a * (h[u] ?? 0)
      p[v] = b * (h[v] ?? 0)
      n[axis] = sign
      positions.push(...p)
      normals.push(...n)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  }
}
