// GLB surgery for reader tests: read and replace the JSON chunk, keeping the BIN chunk.

const jsonLengthOf = (glb: Uint8Array) => new DataView(glb.buffer).getUint32(12, true)

export const jsonOf = (glb: Uint8Array): unknown =>
  JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLengthOf(glb))))

/** Rebuilds a GLB around new JSON, keeping its BIN chunk. */
export function withJson(glb: Uint8Array, json: unknown): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json))
  const padded = (text.byteLength + 3) & ~3
  const bin = glb.subarray(20 + jsonLengthOf(glb))
  const out = new Uint8Array(20 + padded + bin.byteLength)
  const dv = new DataView(out.buffer)
  out.set(glb.subarray(0, 20))
  dv.setUint32(8, out.byteLength, true)
  dv.setUint32(12, padded, true)
  out.set(text, 20)
  out.fill(0x20, 20 + text.byteLength, 20 + padded)
  out.set(bin, 20 + padded)
  return out
}
