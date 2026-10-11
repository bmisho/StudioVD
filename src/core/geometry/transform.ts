import type { Vec3 } from "@/core/schema"
import { meshBounds, type MeshData } from "./meshData"

/** How a source file's coordinates map to the scene (CLAUDE.md §5: mm, right-handed, Y-up). */
export interface SourceFrame {
  /** Millimetres per source unit (units.ts MM_PER_UNIT). */
  mmPerUnit: number
  /** "z": a Z-up source, rotated -90° about X so +Z becomes +Y (handedness is kept). */
  upAxis: "y" | "z"
}

/**
 * Scales to mm and turns Z-up sources Y-up: (x, y, z) -> (x, z, -y), a proper rotation, so
 * triangle winding and normals stay valid. Returns new arrays; the input is not modified.
 */
export function toSceneFrame(mesh: MeshData, frame: SourceFrame): MeshData {
  const s = frame.mmPerUnit
  const positions = new Float32Array(mesh.positions.length)
  const normals = new Float32Array(mesh.normals.length)
  for (let i = 0; i < positions.length; i += 3) {
    const x = mesh.positions[i] ?? 0
    const y = mesh.positions[i + 1] ?? 0
    const z = mesh.positions[i + 2] ?? 0
    const nx = mesh.normals[i] ?? 0
    const ny = mesh.normals[i + 1] ?? 0
    const nz = mesh.normals[i + 2] ?? 0
    if (frame.upAxis === "z") {
      positions.set([x * s, z * s, -y * s], i)
      normals.set([nx, nz, -ny], i)
    } else {
      positions.set([x * s, y * s, z * s], i)
      normals.set([nx, ny, nz], i)
    }
  }
  return { ...mesh, positions, normals }
}

/**
 * Moves the mesh so its bounding-box centre is the origin and returns that centre: it becomes
 * the part's position, so the part appears exactly where it was in the source file while its
 * local coordinates stay small (float32 keeps ~0.1 µm resolution on a 1 m part).
 */
export function recentre(mesh: MeshData): { mesh: MeshData; offsetMm: Vec3 } {
  const { min, max } = meshBounds(mesh)
  const offsetMm: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const positions = new Float32Array(mesh.positions.length)
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (mesh.positions[i] ?? 0) - offsetMm[0]
    positions[i + 1] = (mesh.positions[i + 1] ?? 0) - offsetMm[1]
    positions[i + 2] = (mesh.positions[i + 2] ?? 0) - offsetMm[2]
  }
  return { mesh: { ...mesh, positions }, offsetMm }
}
