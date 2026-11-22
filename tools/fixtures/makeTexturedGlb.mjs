// Writes tests/fixtures/textured.glb: one 20 mm square plate (2 mm thick, metres) whose
// material has an embedded base-colour texture (tests/fixtures/checker.png in a bufferView),
// written from scratch for StudioVD's tests (CC0-1.0). three's GLTFLoader turns an embedded
// image into a blob: URL, which the release CSP must allow (PLAN 15.1).
import { readFileSync, writeFileSync } from "node:fs"

const s = 0.01 // half size, metres
const t = 0.001 // half thickness
// The top face (+Y) carries the texture; a box keeps the mesh closed.
const corners = [
  [-s, -t, -s],
  [s, -t, -s],
  [s, -t, s],
  [-s, -t, s],
  [-s, t, -s],
  [s, t, -s],
  [s, t, s],
  [-s, t, s],
]
const faces = [
  [
    [4, 7, 6, 5],
    [0, 1, 0],
  ],
  [
    [0, 1, 2, 3],
    [0, -1, 0],
  ],
  [
    [0, 4, 5, 1],
    [0, 0, -1],
  ],
  [
    [2, 6, 7, 3],
    [0, 0, 1],
  ],
  [
    [1, 5, 6, 2],
    [1, 0, 0],
  ],
  [
    [0, 3, 7, 4],
    [-1, 0, 0],
  ],
]
const pos = []
const nor = []
const uv = []
const idx = []
for (const [quad, n] of faces) {
  const base = pos.length / 3
  quad.forEach((c, i) => {
    pos.push(...corners[c])
    nor.push(...n)
    uv.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0)
  })
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
}
const png = readFileSync(new URL("../../tests/fixtures/checker.png", import.meta.url))
const parts = [
  new Float32Array(pos),
  new Float32Array(nor),
  new Float32Array(uv),
  new Uint16Array(idx),
  png,
]
const views = []
const chunks = []
let offset = 0
for (const p of parts) {
  const bytes = new Uint8Array(p.buffer, p.byteOffset, p.byteLength)
  views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength })
  chunks.push({ offset, bytes })
  offset = (offset + bytes.byteLength + 3) & ~3
}
views[0].target = views[1].target = views[2].target = 34962
views[3].target = 34963
const gltf = {
  asset: { version: "2.0", generator: "StudioVD makeTexturedGlb" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: "Checker plate", mesh: 0 }],
  meshes: [
    {
      primitives: [
        { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 },
      ],
    },
  ],
  materials: [
    {
      name: "Checker",
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 0.8,
      },
    },
  ],
  textures: [{ source: 0 }],
  images: [{ bufferView: 4, mimeType: "image/png" }],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 24,
      type: "VEC3",
      min: [-s, -t, -s],
      max: [s, t, s],
    },
    { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
    { bufferView: 2, componentType: 5126, count: 24, type: "VEC2" },
    { bufferView: 3, componentType: 5123, count: 36, type: "SCALAR" },
  ],
  buffers: [{ byteLength: offset }],
  bufferViews: views,
}
const bin = new Uint8Array(offset)
for (const c of chunks) bin.set(c.bytes, c.offset)
let json = new TextEncoder().encode(JSON.stringify(gltf))
const jsonPadded = new Uint8Array((json.length + 3) & ~3).fill(0x20)
jsonPadded.set(json)
json = jsonPadded
const total = 12 + 8 + json.length + 8 + bin.length
const out = new Uint8Array(total)
const view = new DataView(out.buffer)
view.setUint32(0, 0x46546c67, true)
view.setUint32(4, 2, true)
view.setUint32(8, total, true)
view.setUint32(12, json.length, true)
view.setUint32(16, 0x4e4f534a, true)
out.set(json, 20)
view.setUint32(20 + json.length, bin.length, true)
view.setUint32(24 + json.length, 0x004e4942, true)
out.set(bin, 28 + json.length)
writeFileSync(new URL("../../tests/fixtures/textured.glb", import.meta.url), out)
