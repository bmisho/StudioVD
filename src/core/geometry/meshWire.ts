// The mesh and convex-piece wire formats of Rust's decomposition (src-tauri/src/geometry/
// decompose), little-endian. Mesh: u32 vertices, u32 triangles, f32 × 3 each, u32 × 3 each.
// Pieces: u32 count, then per piece u32 points and f32 × 3 each.

/** The mesh as Rust's `decompose_mesh` reads it. */
export function encodeMesh(positions: Float32Array, indices: Uint32Array): Uint8Array {
  const vertices = Math.floor(positions.length / 3)
  const triangles = Math.floor(indices.length / 3)
  const out = new Uint8Array(8 + 12 * vertices + 12 * triangles)
  const view = new DataView(out.buffer)
  view.setUint32(0, vertices, true)
  view.setUint32(4, triangles, true)
  let at = 8
  for (let i = 0; i < vertices * 3; i++, at += 4) view.setFloat32(at, positions[i] ?? 0, true)
  for (let i = 0; i < triangles * 3; i++, at += 4) view.setUint32(at, indices[i] ?? 0, true)
  return out
}

/** Pieces as Rust returns them, each a point list; null for anything malformed. */
export function decodePieces(buffer: ArrayBuffer): Float32Array[] | null {
  const view = new DataView(buffer)
  if (buffer.byteLength < 4) return null
  const count = view.getUint32(0, true)
  const pieces: Float32Array[] = []
  let at = 4
  for (let p = 0; p < count; p++) {
    if (at + 4 > buffer.byteLength) return null
    const points = view.getUint32(at, true)
    at += 4
    if (points < 4 || at + 12 * points > buffer.byteLength) return null
    const piece = new Float32Array(3 * points)
    for (let i = 0; i < piece.length; i++, at += 4) {
      const v = view.getFloat32(at, true)
      if (!Number.isFinite(v)) return null
      piece[i] = v
    }
    pieces.push(piece)
  }
  return at === buffer.byteLength && pieces.length > 0 ? pieces : null
}
