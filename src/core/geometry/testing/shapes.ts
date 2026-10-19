import type { AssetGeometry } from "../glbFormat"
import { boxMesh } from "../box"
import type { MeshData } from "../meshData"

export { boxMesh }

// Test shapes built from plain arrays (no three.js), shared by geometry tests.

/** A box as a stored asset: hull normals are just the render normals here. */
export function boxAsset(sx = 10, sy = 20, sz = 30): AssetGeometry {
  const mesh = boxMesh(sx, sy, sz)
  return {
    mesh,
    hullNormals: mesh.normals.slice(),
    faces: [{ first: 0, last: 11, kind: "other" }],
    slots: [{ name: null, color: [0.8, 0.1, 0.1], first: 0, last: 11 }],
  }
}

/** The box with its +z and -z faces (triangles 8-11) in a second slot, which has no colour. */
export function twoSlotBoxAsset(): AssetGeometry {
  const asset = boxAsset()
  return {
    ...asset,
    faces: [
      { first: 0, last: 7, kind: "other" },
      { first: 8, last: 11, kind: "other" },
    ],
    slots: [
      { name: "Body", color: [0.8, 0.1, 0.1], first: 0, last: 7 },
      { name: "Trim", color: null, first: 8, last: 11 },
    ],
  }
}

/** An n x n vertex height grid (open, 2(n-1)² triangles): over 65535 vertices from n = 256. */
export function gridMesh(n: number): MeshData {
  const positions = new Float32Array(3 * n * n)
  const normals = new Float32Array(3 * n * n)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x
      positions.set([x * 0.5, y * 0.25, ((x * 7 + y * 3) % 5) * 0.1], 3 * i)
      normals.set([0, 0, 1], 3 * i)
    }
  const indices: number[] = []
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const a = y * n + x
      indices.push(a, a + 1, a + n, a + 1, a + n + 1, a + n)
    }
  return { positions, normals, indices: Uint32Array.from(indices) }
}

/**
 * Closed cylinder along +Z (centred at the origin) as an STL would give it: unindexed
 * triangles (3 vertices each) with facet normals. `segments` facets around; optional arc
 * only (no caps) for partial surfaces.
 */
export function cylinderSoup(
  radius: number,
  height: number,
  segments: number,
  arcRad = 2 * Math.PI
) {
  const positions: number[] = []
  const full = Math.abs(arcRad - 2 * Math.PI) < 1e-12
  const at = (i: number) => {
    const a = (i / segments) * arcRad
    return [radius * Math.cos(a), radius * Math.sin(a)] as const
  }
  const h = height / 2
  for (let i = 0; i < segments; i++) {
    const [x0, y0] = at(i)
    const [x1, y1] = at(i + 1)
    positions.push(x0, y0, -h, x1, y1, -h, x1, y1, h, x0, y0, -h, x1, y1, h, x0, y0, h)
    if (full) {
      positions.push(0, 0, h, x0, y0, h, x1, y1, h) // top cap, outward +Z
      positions.push(0, 0, -h, x1, y1, -h, x0, y0, -h) // bottom cap, outward -Z
    }
  }
  return soup(positions)
}

/** Unindexed triangles -> MeshData with facet normals (what an STL loader produces). */
export function soup(positions: number[]): MeshData {
  const p = new Float32Array(positions)
  const normals = new Float32Array(p.length)
  for (let t = 0; t < p.length; t += 9) {
    const u = [0, 1, 2].map((k) => (p[t + 3 + k] ?? 0) - (p[t + k] ?? 0))
    const v = [0, 1, 2].map((k) => (p[t + 6 + k] ?? 0) - (p[t + k] ?? 0))
    const n = [
      (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
      (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
      (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
    ]
    const len = Math.hypot(...n) || 1
    for (let c = 0; c < 3; c++)
      normals.set(
        n.map((x) => x / len),
        t + 3 * c
      )
  }
  return { positions: p, normals, indices: Uint32Array.from({ length: p.length / 3 }, (_, i) => i) }
}

/** Rotates a mesh in place by a unit quaternion [x, y, z, w]. */
export function rotateMesh(mesh: MeshData, q: [number, number, number, number]): MeshData {
  const [qx, qy, qz, qw] = q
  const rot = (a: Float32Array) => {
    for (let i = 0; i < a.length; i += 3) {
      const x = a[i] ?? 0
      const y = a[i + 1] ?? 0
      const z = a[i + 2] ?? 0
      // t = 2 q×v; v' = v + w t + q×t
      const tx = 2 * (qy * z - qz * y)
      const ty = 2 * (qz * x - qx * z)
      const tz = 2 * (qx * y - qy * x)
      a[i] = x + qw * tx + (qy * tz - qz * ty)
      a[i + 1] = y + qw * ty + (qz * tx - qx * tz)
      a[i + 2] = z + qw * tz + (qx * ty - qy * tx)
    }
  }
  rot(mesh.positions)
  rot(mesh.normals)
  return mesh
}
