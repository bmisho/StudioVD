/**
 * Files a model refers to next to itself, read through `read_import_resource` (which only
 * resolves them inside the model's directory). Textures are not followed: imports carry
 * geometry and base colours only (materials arrive in Phase 6).
 */

const MTLLIB = new TextEncoder().encode("mtllib")
const isSpace = (b: number | undefined) => b === 0x20 || b === 0x09
const isLineStart = (bytes: Uint8Array, i: number) =>
  i === 0 || bytes[i - 1] === 0x0a || bytes[i - 1] === 0x0d

/**
 * OBJ material libraries (`mtllib name.mtl`). Scans bytes, not decoded text: an OBJ can be
 * hundreds of MB. The rest of the line is one file name, as three's OBJLoader reads it.
 */
export function objMaterialLibraries(bytes: Uint8Array): string[] {
  const names: string[] = []
  const decoder = new TextDecoder()
  for (let i = bytes.indexOf(MTLLIB[0] ?? 0); i >= 0; i = bytes.indexOf(MTLLIB[0] ?? 0, i + 1)) {
    if (!isLineStart(bytes, i) || !MTLLIB.every((b, k) => bytes[i + k] === b)) continue
    if (!isSpace(bytes[i + MTLLIB.length])) continue
    let end = i + MTLLIB.length
    while (end < bytes.length && bytes[end] !== 0x0a && bytes[end] !== 0x0d) end++
    const name = decoder.decode(bytes.subarray(i + MTLLIB.length, end)).trim()
    if (name && !names.includes(name)) names.push(name)
    i = end
  }
  return names
}

/** Percent-decodes a relative URI; a malformed escape leaves it as written. */
export function decodeUri(uri: string): string {
  try {
    return decodeURIComponent(uri)
  } catch {
    return uri
  }
}

/** Percent-decoded external buffer URIs of a .gltf (data: URIs are embedded, not files). */
export function gltfBufferUris(json: unknown): string[] {
  if (typeof json !== "object" || json === null) return []
  const buffers = (json as { buffers?: unknown }).buffers
  if (!Array.isArray(buffers)) return []
  const uris: string[] = []
  for (const buffer of buffers as unknown[]) {
    const uri = (buffer as { uri?: unknown } | null)?.uri
    if (typeof uri !== "string" || uri === "" || uri.startsWith("data:")) continue
    const decoded = decodeUri(uri)
    if (!uris.includes(decoded)) uris.push(decoded)
  }
  return uris
}
