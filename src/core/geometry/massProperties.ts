import type { Vec3 } from "@/core/schema"
import type { MeshData } from "./meshData"

/**
 * Volume (mm³) and centroid of a closed, outward-oriented mesh by the divergence theorem
 * (PLAN §2): V_t = p1·(p2×p3)/6, V = Σ V_t, c = Σ V_t (p1+p2+p3)/4 / V. On an open or
 * inside-out mesh the numbers are meaningless; callers check `isWatertight` (topology.ts) first.
 */
export function volumeAndCentroid(mesh: MeshData): { volumeMm3: number; centroidMm: Vec3 } {
  const p = mesh.positions
  const idx = mesh.indices
  let v = 0
  let cx = 0
  let cy = 0
  let cz = 0
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * (idx[t] ?? 0)
    const b = 3 * (idx[t + 1] ?? 0)
    const c = 3 * (idx[t + 2] ?? 0)
    const ax = p[a] ?? 0
    const ay = p[a + 1] ?? 0
    const az = p[a + 2] ?? 0
    const bx = p[b] ?? 0
    const by = p[b + 1] ?? 0
    const bz = p[b + 2] ?? 0
    const qx = p[c] ?? 0
    const qy = p[c + 1] ?? 0
    const qz = p[c + 2] ?? 0
    const vt = (ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx)) / 6
    v += vt
    cx += (vt * (ax + bx + qx)) / 4
    cy += (vt * (ay + by + qy)) / 4
    cz += (vt * (az + bz + qz)) / 4
  }
  return v === 0
    ? { volumeMm3: 0, centroidMm: [0, 0, 0] }
    : { volumeMm3: v, centroidMm: [cx / v, cy / v, cz / v] }
}
