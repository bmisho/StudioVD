import { decodePieces, encodeMesh } from "@/core/geometry/meshWire"
import { call } from "./invoke"
import { err, ok, type Result } from "./result"

/**
 * Convex decomposition in Rust (PLAN 10.2): the mesh (part-local mm) as convex point lists,
 * cached by Rust per exact mesh. Seconds for a detailed part.
 */
export async function decomposeMesh(
  positions: Float32Array,
  indices: Uint32Array
): Promise<Result<Float32Array[]>> {
  const answer = await call<ArrayBuffer>("decompose_mesh", encodeMesh(positions, indices))
  if (!answer.ok) return answer
  const pieces = decodePieces(answer.value)
  return pieces
    ? ok(pieces)
    : err({ kind: "internal", message: "The decomposition came back malformed." })
}
