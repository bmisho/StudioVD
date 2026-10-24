import { SlotNameSchema, type Vec3 } from "@/core/schema"
import {
  CHUNK_BIN,
  CHUNK_JSON,
  EXTRAS_KEY,
  EXTRAS_VERSION,
  EXTRAS_VERSION_SLOTS,
  FLOAT,
  GLB_MAGIC,
  GltfJsonSchema,
  HULL_NORMAL_ATTRIBUTE,
  UNSIGNED_SHORT,
  type AssetGeometry,
  type GltfJson,
} from "./glbFormat"
import { assertValidMesh, type FaceInfo } from "./meshData"
import type { AssetSlot } from "./slots"

/** Hard ceiling for one asset (a 2-3 M triangle budget is the whole scene). */
export const MAX_GLB_BYTES = 512 * 1024 * 1024

const COMPONENTS = { SCALAR: 1, VEC3: 3 } as const

function chunks(bytes: Uint8Array): { json: unknown; bin: Uint8Array } {
  if (bytes.byteLength < 28 || bytes.byteLength > MAX_GLB_BYTES) throw new Error("bad GLB size")
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (dv.getUint32(0, true) !== GLB_MAGIC || dv.getUint32(4, true) !== 2) {
    throw new Error("not a glTF 2.0 binary")
  }
  if (dv.getUint32(8, true) !== bytes.byteLength) throw new Error("GLB length mismatch")
  const jsonLength = dv.getUint32(12, true)
  if (dv.getUint32(16, true) !== CHUNK_JSON || 20 + jsonLength + 8 > bytes.byteLength) {
    throw new Error("bad JSON chunk")
  }
  const binStart = 20 + jsonLength
  const binLength = dv.getUint32(binStart, true)
  if (
    dv.getUint32(binStart + 4, true) !== CHUNK_BIN ||
    binStart + 8 + binLength > bytes.byteLength
  ) {
    throw new Error("bad BIN chunk")
  }
  const json: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)))
  return { json, bin: bytes.subarray(binStart + 8, binStart + 8 + binLength) }
}

/** Copies an accessor out of the BIN chunk into a fresh, aligned typed array. */
function readAccessor(gltf: GltfJson, bin: Uint8Array, index: number, want: "SCALAR" | "VEC3") {
  const a = gltf.accessors[index]
  if (!a || a.type !== want) throw new Error(`accessor ${index} missing or not ${want}`)
  const view = gltf.bufferViews[a.bufferView]
  if (!view) throw new Error(`bufferView ${a.bufferView} missing`)
  const size = a.componentType === FLOAT ? 4 : a.componentType === UNSIGNED_SHORT ? 2 : 4
  const length = a.count * COMPONENTS[a.type]
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0)
  if (start + length * size > (view.byteOffset ?? 0) + view.byteLength) {
    throw new Error(`accessor ${index} overruns its bufferView`)
  }
  if ((view.byteOffset ?? 0) + view.byteLength > bin.byteLength) {
    throw new Error(`bufferView ${a.bufferView} overruns the BIN chunk`)
  }
  const raw = bin.slice(start, start + length * size) // copy: aligned and transferable
  if (a.componentType === FLOAT) return new Float32Array(raw.buffer)
  if (a.componentType === UNSIGNED_SHORT) return Uint32Array.from(new Uint16Array(raw.buffer))
  return new Uint32Array(raw.buffer)
}

const floats = (a: Float32Array | Uint32Array, what: string): Float32Array => {
  if (!(a instanceof Float32Array)) throw new Error(`${what} must be FLOAT`)
  return a
}

const sameAttributes = (a: Record<string, number>, b: Record<string, number>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v)

/**
 * The index buffer and slots. Version 1: one primitive, at most one material. Version 2: one
 * primitive per slot, sharing attributes, each the next window of one index bufferView, each
 * with its own named material (unique names, as `SlotNameSchema` allows).
 */
function readSlots(gltf: GltfJson, bin: Uint8Array) {
  const mesh = gltf.meshes[0]
  const primitives = mesh?.primitives ?? []
  const first = primitives[0]
  if (!mesh || !first) throw new Error("GLB has no mesh")
  const multi = primitives.length > 1
  const v = mesh.extras?.[EXTRAS_KEY].v ?? EXTRAS_VERSION
  if (v !== (multi ? EXTRAS_VERSION_SLOTS : EXTRAS_VERSION)) throw new Error("bad asset version")
  const parts: Uint32Array[] = []
  const slots: AssetSlot[] = []
  const names = new Set<string>()
  let triangles = 0
  primitives.forEach((p, i) => {
    if (!sameAttributes(p.attributes, first.attributes))
      throw new Error("slots differ in attributes")
    const accessor = gltf.accessors[p.indices]
    const head = gltf.accessors[first.indices]
    const indices = readAccessor(gltf, bin, p.indices, "SCALAR")
    if (indices instanceof Float32Array) throw new Error("indices must be integers")
    if (indices.length === 0 || indices.length % 3 !== 0) throw new Error("bad slot size")
    const size = accessor?.componentType === UNSIGNED_SHORT ? 2 : 4
    const window =
      accessor?.bufferView === head?.bufferView &&
      accessor?.componentType === head?.componentType &&
      (accessor?.byteOffset ?? 0) === 3 * triangles * size
    if (multi && !window) throw new Error("slots must be consecutive windows of one index buffer")
    const material = p.material === undefined ? undefined : gltf.materials?.[p.material]
    if (multi && (p.material !== i || !material)) throw new Error("each slot needs its material")
    const name = material?.name ?? null
    if (multi && (!SlotNameSchema.safeParse(name).success || names.has(name ?? ""))) {
      throw new Error("slot names must be unique and clean")
    }
    if (name !== null) names.add(name)
    const factor = material?.pbrMetallicRoughness.baseColorFactor
    const color: Vec3 | null = factor ? [factor[0], factor[1], factor[2]] : null
    const count = indices.length / 3
    slots.push({ name: multi ? name : null, color, first: triangles, last: triangles + count - 1 })
    parts.push(indices)
    triangles += count
  })
  const indices = new Uint32Array(3 * triangles)
  let at = 0
  for (const part of parts) {
    indices.set(part, at)
    at += part.length
  }
  return { indices, slots, attributes: first.attributes }
}

/** The slot whose range holds triangle `t` (slots are sorted and tile the buffer). */
export function slotAt(slots: readonly AssetSlot[], t: number): number {
  let lo = 0
  let hi = slots.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((slots[mid]?.first ?? 0) <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

/**
 * Decodes a GLB written by `encodeGlb`. Strict: any structure it does not produce, or any
 * index or size that points outside the file, is an error rather than a guess.
 */
export function decodeGlb(bytes: Uint8Array): AssetGeometry {
  const { json, bin } = chunks(bytes)
  const gltf = GltfJsonSchema.parse(json)
  const mesh = gltf.meshes[0]
  if (!mesh) throw new Error("GLB has no mesh")
  const { indices: indexArray, slots, attributes } = readSlots(gltf, bin)
  const primitive = { attributes }
  const attr = (name: string) => {
    const i = primitive.attributes[name]
    return i === undefined ? undefined : floats(readAccessor(gltf, bin, i, "VEC3"), name)
  }
  const positions = attr("POSITION")
  const normals = attr("NORMAL")
  const hullNormals = attr(HULL_NORMAL_ATTRIBUTE)
  if (!positions || !normals || !hullNormals) throw new Error("GLB lacks required attributes")
  const colors = attr("COLOR_0")
  const meshData = { positions, normals, indices: indexArray, ...(colors ? { colors } : {}) }
  assertValidMesh(meshData)
  if (hullNormals.length !== positions.length) throw new Error("hull normals length mismatch")

  const faces: FaceInfo[] = mesh.extras?.[EXTRAS_KEY].faces ?? []
  const triangles = indexArray.length / 3
  // Sorted and disjoint, as our writer stores them: lookups bisect them, and per-face passes
  // over overlapping ranges (each the whole mesh) would cost faces × triangles.
  let previous = -1
  for (const f of faces) {
    if (f.first <= previous) throw new Error("face ranges overlap or are out of order")
    previous = f.last
    if (f.last >= triangles) throw new Error("face range out of bounds")
    if (slotAt(slots, f.first) !== slotAt(slots, f.last)) throw new Error("a face spans two slots")
  }
  return { mesh: meshData, hullNormals, faces, slots }
}
