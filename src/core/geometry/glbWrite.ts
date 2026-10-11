import {
  ARRAY_BUFFER,
  CHUNK_BIN,
  CHUNK_JSON,
  ELEMENT_ARRAY_BUFFER,
  EXTRAS_KEY,
  EXTRAS_VERSION,
  FLOAT,
  GLB_MAGIC,
  HULL_NORMAL_ATTRIBUTE,
  UNSIGNED_INT,
  UNSIGNED_SHORT,
  type AssetGeometry,
} from "./glbFormat"
import { assertValidMesh, vertexCount } from "./meshData"

const pad4 = (n: number) => (n + 3) & ~3

interface View {
  bytes: Uint8Array
  target: number
}

function float32MinMax(a: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < a.length; i++) {
    const k = i % 3
    const v = a[i] ?? 0
    if (v < (min[k] ?? 0)) min[k] = v
    if (v > (max[k] ?? 0)) max[k] = v
  }
  return { min, max }
}

const bytesOf = (a: Float32Array | Uint16Array | Uint32Array) =>
  new Uint8Array(a.buffer, a.byteOffset, a.byteLength)

/**
 * Encodes an asset as GLB. Deterministic: the same geometry always gives the same bytes (the
 * JSON is built in a fixed key order and nothing time- or environment-dependent is written),
 * so the SHA-256 of the output is a content address. Indices are 16-bit when they fit.
 */
export function encodeGlb(asset: AssetGeometry): Uint8Array {
  const { mesh, hullNormals, faces, baseColor } = asset
  assertValidMesh(mesh)
  if (mesh.indices.length === 0) throw new Error("cannot encode an empty mesh")
  if (hullNormals.length !== mesh.positions.length) throw new Error("hull normals length mismatch")
  const n = vertexCount(mesh)
  const indices = n <= 0xffff ? Uint16Array.from(mesh.indices) : mesh.indices

  const views: View[] = [
    { bytes: bytesOf(mesh.positions), target: ARRAY_BUFFER },
    { bytes: bytesOf(mesh.normals), target: ARRAY_BUFFER },
    { bytes: bytesOf(hullNormals), target: ARRAY_BUFFER },
    ...(mesh.colors ? [{ bytes: bytesOf(mesh.colors), target: ARRAY_BUFFER }] : []),
    { bytes: bytesOf(indices), target: ELEMENT_ARRAY_BUFFER },
  ]
  let offset = 0
  const bufferViews = views.map((v) => {
    const view = { buffer: 0, byteOffset: offset, byteLength: v.bytes.byteLength, target: v.target }
    offset = pad4(offset + v.bytes.byteLength)
    return view
  })
  const binLength = offset

  const vec3 = (bufferView: number) => ({
    bufferView,
    componentType: FLOAT,
    count: n,
    type: "VEC3",
  })
  const accessors: object[] = [
    { ...vec3(0), ...float32MinMax(mesh.positions) },
    vec3(1),
    vec3(2),
    ...(mesh.colors ? [vec3(3)] : []),
  ]
  const attributes: Record<string, number> = { POSITION: 0, NORMAL: 1, [HULL_NORMAL_ATTRIBUTE]: 2 }
  if (mesh.colors) attributes.COLOR_0 = 3
  const indexAccessor = accessors.length
  accessors.push({
    bufferView: views.length - 1,
    componentType: indices instanceof Uint16Array ? UNSIGNED_SHORT : UNSIGNED_INT,
    count: indices.length,
    type: "SCALAR",
  })

  const primitive = baseColor
    ? { attributes, indices: indexAccessor, material: 0, mode: 4 }
    : { attributes, indices: indexAccessor, mode: 4 }
  const json = {
    asset: { version: "2.0", generator: "StudioVD" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [primitive], extras: { [EXTRAS_KEY]: { v: EXTRAS_VERSION, faces } } }],
    ...(baseColor
      ? {
          materials: [
            {
              pbrMetallicRoughness: {
                baseColorFactor: [...baseColor, 1],
                metallicFactor: 0,
                roughnessFactor: 0.55,
              },
            },
          ],
        }
      : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength: binLength }],
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonLength = pad4(jsonBytes.byteLength)
  const total = 12 + 8 + jsonLength + 8 + binLength
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, GLB_MAGIC, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jsonLength, true)
  dv.setUint32(16, CHUNK_JSON, true)
  out.set(jsonBytes, 20)
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength) // JSON pads with spaces
  const binStart = 20 + jsonLength
  dv.setUint32(binStart, binLength, true)
  dv.setUint32(binStart + 4, CHUNK_BIN, true)
  views.forEach((v, i) => out.set(v.bytes, binStart + 8 + (bufferViews[i]?.byteOffset ?? 0)))
  return out // BIN padding stays zero
}
