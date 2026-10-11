import type { Vec3 } from "@/core/schema"
import {
  CHUNK_BIN,
  CHUNK_JSON,
  EXTRAS_KEY,
  FLOAT,
  GLB_MAGIC,
  GltfJsonSchema,
  HULL_NORMAL_ATTRIBUTE,
  UNSIGNED_SHORT,
  type AssetGeometry,
  type GltfJson,
} from "./glbFormat"
import { assertValidMesh, type FaceInfo } from "./meshData"

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

/**
 * Decodes a GLB written by `encodeGlb`. Strict: any structure it does not produce, or any
 * index or size that points outside the file, is an error rather than a guess.
 */
export function decodeGlb(bytes: Uint8Array): AssetGeometry {
  const { json, bin } = chunks(bytes)
  const gltf = GltfJsonSchema.parse(json)
  const mesh = gltf.meshes[0]
  const primitive = mesh?.primitives[0]
  if (!mesh || !primitive) throw new Error("GLB has no mesh")
  const attr = (name: string) => {
    const i = primitive.attributes[name]
    return i === undefined ? undefined : floats(readAccessor(gltf, bin, i, "VEC3"), name)
  }
  const positions = attr("POSITION")
  const normals = attr("NORMAL")
  const hullNormals = attr(HULL_NORMAL_ATTRIBUTE)
  if (!positions || !normals || !hullNormals) throw new Error("GLB lacks required attributes")
  const indexArray = readAccessor(gltf, bin, primitive.indices, "SCALAR")
  if (indexArray instanceof Float32Array) throw new Error("indices must be integers")
  const colors = attr("COLOR_0")
  const meshData = { positions, normals, indices: indexArray, ...(colors ? { colors } : {}) }
  assertValidMesh(meshData)
  if (hullNormals.length !== positions.length) throw new Error("hull normals length mismatch")

  const faces: FaceInfo[] = mesh.extras?.[EXTRAS_KEY].faces ?? []
  const triangles = indexArray.length / 3
  for (const f of faces) if (f.last >= triangles) throw new Error("face range out of bounds")
  const material =
    primitive.material === undefined ? undefined : gltf.materials?.[primitive.material]
  const factor = material?.pbrMetallicRoughness.baseColorFactor
  const baseColor: Vec3 | null = factor ? [factor[0], factor[1], factor[2]] : null
  return { mesh: meshData, hullNormals, faces, baseColor }
}
