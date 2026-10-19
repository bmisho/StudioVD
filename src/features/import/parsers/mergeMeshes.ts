import { slotCollector } from "@/core/geometry/slots"
import { slotFields, type ParsedMesh } from "./parsedMesh"

const indicesOf = (m: ParsedMesh) =>
  m.indices ?? Uint32Array.from({ length: m.positions.length / 3 }, (_, i) => i)

/**
 * Concatenates meshes into one: split mode "single", and the primitives of one glTF mesh. Each
 * keeps its materials as slots (their union, in order of first appearance). Normals and B-rep
 * faces survive only if every mesh has them.
 */
export function mergeMeshes(meshes: ParsedMesh[], name: string, path: string[] = []): ParsedMesh {
  const keepNormals = meshes.every((m) => m.normals)
  const vertexFloats = meshes.reduce((n, m) => n + m.positions.length, 0)
  const indexCount = meshes.reduce((n, m) => n + indicesOf(m).length, 0)
  const positions = new Float32Array(vertexFloats)
  const normals = keepNormals ? new Float32Array(vertexFloats) : undefined
  const indices = new Uint32Array(indexCount)
  const triangleSlots = new Uint16Array(indexCount / 3)
  const slots = slotCollector()
  const faceRanges: { first: number; last: number }[] = []
  let allRanges = true
  let floatAt = 0
  let indexAt = 0
  for (const m of meshes) {
    const base = floatAt / 3
    const triangleBase = indexAt / 3
    const own = indicesOf(m)
    positions.set(m.positions, floatAt)
    if (normals && m.normals) normals.set(m.normals, floatAt)
    for (const i of own) indices[indexAt++] = base + i
    floatAt += m.positions.length
    const multi = m.slots && m.triangleSlots?.length === own.length / 3
    const remap = (multi ? (m.slots ?? []) : [{ name: null, color: m.color ?? null }]).map((s) =>
      slots.add(s.name, s.color)
    )
    for (let t = 0; t < own.length / 3; t++)
      triangleSlots[triangleBase + t] = remap[multi ? (m.triangleSlots?.[t] ?? 0) : 0] ?? 0
    if (m.faceRanges) {
      for (const r of m.faceRanges) {
        faceRanges.push({ first: r.first + triangleBase, last: r.last + triangleBase })
      }
    } else allRanges = false
  }
  return {
    name,
    path,
    positions,
    ...(normals ? { normals } : {}),
    indices,
    ...(allRanges ? { faceRanges } : {}),
    ...slotFields(slots.slots, triangleSlots),
  }
}
