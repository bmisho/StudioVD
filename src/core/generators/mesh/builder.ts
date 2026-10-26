import type { Vec3 } from "@/core/schema"

/** A body's mesh in the component frame (mm, Y up), one face per natural surface. */
export interface BodyMesh {
  positions: Float32Array
  /** Smoothed within each face only, so face boundaries stay creased. */
  normals: Float32Array
  indices: Uint32Array
  /** Inclusive triangle ranges in order, covering every triangle (B-rep faces for Phase 4). */
  faceRanges: { first: number; last: number }[]
  /** Material slot of each triangle; only when the body has two or more slots. */
  triangleSlots?: Uint16Array
}

/**
 * Collects a body face by face. Each face has its own vertices (`face` starts a new set), so
 * the normals averaged per vertex never blend across a crease; positions computed by the same
 * formula are bit-identical, which is what welds neighbouring faces into a closed shell.
 */
export class BodyBuilder {
  private readonly positions: number[] = []
  private readonly indices: number[] = []
  private readonly faces: { first: number; last: number }[] = []
  private readonly slotOf: number[] = []
  private slot = 0
  private open = false
  private slotsUsed = new Set<number>()

  /** Starts a face in material slot `slot` (index into the body's slots). */
  face(slot = 0): this {
    this.close()
    this.slot = slot
    this.open = true
    this.faces.push({ first: this.indices.length / 3, last: this.indices.length / 3 - 1 })
    return this
  }

  vertex(p: Vec3): number {
    if (!this.open) throw new Error("vertex outside a face")
    this.positions.push(p[0], p[1], p[2])
    return this.positions.length / 3 - 1
  }

  /** Counter-clockwise seen from outside. */
  triangle(a: number, b: number, c: number): this {
    if (!this.open) throw new Error("triangle outside a face")
    if (a === b || b === c || c === a) return this // a pole: nothing to draw
    this.indices.push(a, b, c)
    this.slotOf.push(this.slot)
    this.slotsUsed.add(this.slot)
    return this
  }

  /** a → b → c → d counter-clockwise seen from outside. */
  quad(a: number, b: number, c: number, d: number): this {
    return this.triangle(a, b, c).triangle(a, c, d)
  }

  private close(): void {
    if (!this.open) return
    const face = this.faces.at(-1)
    if (face) face.last = this.indices.length / 3 - 1
    if (face && face.last < face.first) this.faces.pop() // nothing drawn
    this.open = false
  }

  build(): BodyMesh {
    this.close()
    const positions = Float32Array.from(this.positions)
    const indices = Uint32Array.from(this.indices)
    const mesh: BodyMesh = {
      positions,
      normals: vertexNormals(positions, indices),
      indices,
      faceRanges: this.faces.map((f) => ({ ...f })),
    }
    if (this.slotsUsed.size > 1 || [...this.slotsUsed].some((s) => s !== 0))
      mesh.triangleSlots = Uint16Array.from(this.slotOf)
    return mesh
  }
}

/** Area-weighted vertex normals (each vertex belongs to one face, so this smooths per face). */
function vertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const sum = new Float64Array(positions.length)
  const at = (i: number) => positions[i] ?? 0
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] ?? 0, indices[t + 1] ?? 0, indices[t + 2] ?? 0]
    const [ux, uy, uz] = [
      at(3 * b) - at(3 * a),
      at(3 * b + 1) - at(3 * a + 1),
      at(3 * b + 2) - at(3 * a + 2),
    ]
    const [vx, vy, vz] = [
      at(3 * c) - at(3 * a),
      at(3 * c + 1) - at(3 * a + 1),
      at(3 * c + 2) - at(3 * a + 2),
    ]
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
    for (const v of [a, b, c])
      for (let k = 0; k < 3; k++) sum[3 * v + k] = (sum[3 * v + k] ?? 0) + (n[k] ?? 0)
  }
  const normals = new Float32Array(positions.length)
  for (let v = 0; v < positions.length; v += 3) {
    const l = Math.hypot(sum[v] ?? 0, sum[v + 1] ?? 0, sum[v + 2] ?? 0)
    if (l > 0) for (let k = 0; k < 3; k++) normals[v + k] = (sum[v + k] ?? 0) / l
  }
  return normals
}
