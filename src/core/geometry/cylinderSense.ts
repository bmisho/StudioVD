import { cross, dot, inPlane, scale, sub } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"
import type { FaceInfo } from "./meshData"

/**
 * A cylinder whose face normals point away from its axis is a shaft, towards it a hole: the
 * sign of their area-weighted sum over the face (one sliver triangle cannot decide it).
 */
export function cylinderSenses(
  { positions, indices }: { positions: Float32Array; indices: Uint32Array },
  faces: readonly FaceInfo[]
): Int8Array {
  const sense = new Int8Array(faces.length)
  const at = (i: number): Vec3 => {
    const v = indices[i] ?? 0
    return [positions[3 * v] ?? 0, positions[3 * v + 1] ?? 0, positions[3 * v + 2] ?? 0]
  }
  const triangles = Math.floor(indices.length / 3)
  faces.forEach((face, f) => {
    const { axis, point } = face
    if (face.kind !== "cylinder" || !axis || !point) return
    let d = 0
    for (let t = Math.max(0, face.first); t <= Math.min(face.last, triangles - 1); t++) {
      const [a, b, c] = [at(3 * t), at(3 * t + 1), at(3 * t + 2)]
      const mid = scale([a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]], 1 / 3)
      d += dot(cross(sub(b, a), sub(c, a)), inPlane(sub(mid, point), axis))
    }
    sense[f] = d > 0 ? 1 : d < 0 ? -1 : 0
  })
  return sense
}
