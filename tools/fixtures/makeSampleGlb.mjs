// Writes tests/fixtures/sample.glb: a small glTF 2.0 assembly in METRES with a node hierarchy,
// node transforms and two coloured materials, written from scratch for StudioVD's tests
// (CC0-1.0). Root "Assembly" (translated +0.1 m on X, turned 90° about Y) holds "Plate"
// (50 x 10 x 40 mm box) and "Peg" (10 x 30 x 10 mm box, raised 20 mm).
import { writeFileSync } from "node:fs"

function box(sx, sy, sz) {
  const h = [sx / 2, sy / 2, sz / 2]
  const pos = []
  const nor = []
  const idx = []
  const faces = [
    [0, 1, 1, 2],
    [0, -1, 2, 1],
    [1, 1, 2, 0],
    [1, -1, 0, 2],
    [2, 1, 0, 1],
    [2, -1, 1, 0],
  ]
  for (const [axis, sign, u, v] of faces) {
    const base = pos.length / 3
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const p = [0, 0, 0]
      const n = [0, 0, 0]
      p[axis] = sign * h[axis]
      p[u] = a * h[u]
      p[v] = b * h[v]
      n[axis] = sign
      pos.push(...p)
      nor.push(...n)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) }
}

/** `scale` grows every length; `names` are the assembly, plate and peg node names. */
export function sampleGlb(scale = 1, names = ["Assembly", "Plate", "Peg"]) {
  const k = scale
  const meshes = [box(0.05 * k, 0.01 * k, 0.04 * k), box(0.01 * k, 0.03 * k, 0.01 * k)]
  const chunks = []
  const views = []
  const accessors = []
  let offset = 0
  const push = (arr, target) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target })
    chunks.push({ offset, bytes })
    offset = (offset + bytes.byteLength + 3) & ~3
    return views.length - 1
  }
  const gltfMeshes = meshes.map((m, i) => {
    const min = [0, 1, 2].map((k) => Math.min(...m.pos.filter((_, j) => j % 3 === k)))
    const max = [0, 1, 2].map((k) => Math.max(...m.pos.filter((_, j) => j % 3 === k)))
    accessors.push({
      bufferView: push(m.pos, 34962),
      componentType: 5126,
      count: m.pos.length / 3,
      type: "VEC3",
      min,
      max,
    })
    accessors.push({
      bufferView: push(m.nor, 34962),
      componentType: 5126,
      count: m.nor.length / 3,
      type: "VEC3",
    })
    accessors.push({
      bufferView: push(m.idx, 34963),
      componentType: 5123,
      count: m.idx.length,
      type: "SCALAR",
    })
    const a = accessors.length - 3
    return {
      name: ["PlateMesh", "PegMesh"][i],
      primitives: [{ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: i }],
    }
  })
  const s = Math.SQRT1_2
  const json = {
    asset: { version: "2.0", generator: "StudioVD fixture" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: names[0], translation: [0.1 * k, 0, 0], rotation: [0, s, 0, s], children: [1, 2] },
      { name: names[1], mesh: 0 },
      { name: names[2], mesh: 1, translation: [0, 0.02 * k, 0] },
    ],
    meshes: gltfMeshes,
    materials: [
      {
        name: "Blue",
        pbrMetallicRoughness: {
          baseColorFactor: [0.1, 0.3, 0.8, 1],
          metallicFactor: 0,
          roughnessFactor: 0.5,
        },
      },
      {
        name: "Orange",
        pbrMetallicRoughness: {
          baseColorFactor: [0.9, 0.4, 0.05, 1],
          metallicFactor: 0,
          roughnessFactor: 0.5,
        },
      },
    ],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  }
  const text = new TextEncoder().encode(JSON.stringify(json))
  const jsonLen = (text.byteLength + 3) & ~3
  const out = new Uint8Array(12 + 8 + jsonLen + 8 + offset)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, out.byteLength, true)
  dv.setUint32(12, jsonLen, true)
  dv.setUint32(16, 0x4e4f534a, true)
  out.set(text, 20)
  out.fill(0x20, 20 + text.byteLength, 20 + jsonLen)
  dv.setUint32(20 + jsonLen, offset, true)
  dv.setUint32(24 + jsonLen, 0x004e4942, true)
  for (const c of chunks) out.set(c.bytes, 28 + jsonLen + c.offset)
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL("../../tests/fixtures/sample.glb", import.meta.url), sampleGlb())
  console.log("wrote tests/fixtures/sample.glb")
}
