// glTF container helpers for import (not our own asset format: see core/geometry/glb*.ts).

const MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

/** Splits any GLB into its JSON object and (optional) BIN chunk. */
export function glbChunks(bytes: Uint8Array): { json: unknown; bin: Uint8Array | null } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 20 || dv.getUint32(0, true) !== MAGIC) throw new Error("Not a GLB file.")
  const jsonLength = dv.getUint32(12, true)
  if (dv.getUint32(16, true) !== JSON_CHUNK || 20 + jsonLength > bytes.byteLength) {
    throw new Error("Malformed GLB: bad JSON chunk.")
  }
  const json: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)))
  const binStart = 20 + jsonLength
  if (binStart + 8 > bytes.byteLength) return { json, bin: null }
  const binLength = dv.getUint32(binStart, true)
  if (
    dv.getUint32(binStart + 4, true) !== BIN_CHUNK ||
    binStart + 8 + binLength > bytes.byteLength
  ) {
    throw new Error("Malformed GLB: bad BIN chunk.")
  }
  return { json, bin: bytes.subarray(binStart + 8, binStart + 8 + binLength) }
}

/** Builds a GLB from a JSON object and an optional BIN chunk. */
export function packGlb(json: unknown, bin: Uint8Array | null): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json))
  const jsonLength = (text.byteLength + 3) & ~3
  const binLength = bin ? (bin.byteLength + 3) & ~3 : 0
  const out = new Uint8Array(20 + jsonLength + (bin ? 8 + binLength : 0))
  const dv = new DataView(out.buffer)
  dv.setUint32(0, MAGIC, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, out.byteLength, true)
  dv.setUint32(12, jsonLength, true)
  dv.setUint32(16, JSON_CHUNK, true)
  out.set(text, 20)
  out.fill(0x20, 20 + text.byteLength, 20 + jsonLength)
  if (bin) {
    dv.setUint32(20 + jsonLength, binLength, true)
    dv.setUint32(24 + jsonLength, BIN_CHUNK, true)
    out.set(bin, 28 + jsonLength)
  }
  return out
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v)

/**
 * Removes images, textures and samplers and every material reference to them (any key ending
 * in "Texture", including inside extensions). Geometry, node transforms and material colours
 * are untouched. Required texture extensions (KTX2/basisu, WebP) are dropped from
 * extensionsRequired since nothing uses them any more.
 */
export function stripTextures(input: unknown): Json {
  if (!isObject(input)) throw new Error("glTF JSON is not an object.")
  const json: Json = { ...input }
  delete json.images
  delete json.textures
  delete json.samplers
  const scrub = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(scrub)
    if (!isObject(node)) return node
    const out: Json = {}
    for (const [k, v] of Object.entries(node)) if (!k.endsWith("Texture")) out[k] = scrub(v)
    return out
  }
  if (Array.isArray(json.materials)) json.materials = json.materials.map(scrub)
  const textureExtensions = [
    "KHR_texture_basisu",
    "EXT_texture_webp",
    "EXT_texture_avif",
    "KHR_texture_transform",
  ]
  for (const key of ["extensionsRequired", "extensionsUsed"]) {
    const list = json[key]
    if (Array.isArray(list)) json[key] = list.filter((e) => !textureExtensions.includes(String(e)))
  }
  return json
}

/**
 * Keeps only the scene that is imported (`scene`, else the first). GLTFLoader loads every
 * scene, and each one it finishes replaces `parser.associations` with its own objects, so the
 * imported scene would lose the mesh/primitive links that group primitives into one part.
 */
export function defaultSceneOnly(json: Json): Json {
  const scenes = json.scenes
  if (!Array.isArray(scenes) || scenes.length <= 1) return json
  const index = typeof json.scene === "number" ? json.scene : 0
  const scene: unknown = scenes[index]
  return scene === undefined ? json : { ...json, scenes: [scene], scene: 0 }
}
