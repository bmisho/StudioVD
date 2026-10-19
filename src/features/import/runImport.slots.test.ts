// @vitest-environment node
import { readFileSync } from "node:fs"
import occtInit from "occt-import-js"
import { describe, expect, it } from "vitest"
import { decodeGlb } from "@/core/geometry/glbRead"
import { encodeGlb } from "@/core/geometry/glbWrite"
import { boxMesh } from "@/core/geometry/box"
import { jsonOf, withJson } from "@/core/geometry/testing/glbJson"
import { twoSlotBoxAsset } from "@/core/geometry/testing/shapes"
import { DEFAULT_IMPORT_OPTIONS, type ImportFormat } from "@/core/import/importOptions"
import { runImport, type ImportJob } from "./runImport"

const fixture = (name: string) => {
  const b = readFileSync(new URL(`../../../tests/fixtures/${name}`, import.meta.url))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}
let occt: ReturnType<typeof occtInit> | undefined
const decoders = { occt: () => (occt ??= occtInit()) }
const job = (name: string, format: ImportFormat, bytes: ArrayBuffer, extra = {}): ImportJob => ({
  fileName: name,
  format,
  bytes,
  options: DEFAULT_IMPORT_OPTIONS,
  ...extra,
})
const text = (s: string) => new TextEncoder().encode(s).slice().buffer
const slotsOf = (glb: Uint8Array | undefined) => decodeGlb(glb ?? new Uint8Array()).slots

/** A binary STL box: the first 6 facets red (own colour), the rest the header's green. */
function colouredStl(): ArrayBuffer {
  const box = boxMesh(10, 10, 10)
  const out = new ArrayBuffer(84 + 50 * 12)
  const dv = new DataView(out)
  const header = new TextEncoder().encode("StudioVD test COLOR=")
  new Uint8Array(out).set(header)
  ;[0, 128, 0, 255].forEach((v, i) => dv.setUint8(header.length + i, v))
  dv.setUint32(80, 12, true)
  for (let t = 0; t < 12; t++) {
    const at = 84 + 50 * t
    for (let k = 0; k < 3; k++) {
      const v = box.indices[3 * t + k] ?? 0
      for (let c = 0; c < 3; c++)
        dv.setFloat32(at + 12 + 12 * k + 4 * c, box.positions[3 * v + c] ?? 0, true)
    }
    dv.setUint16(at + 48, t < 6 ? 0x001f : 0x8000, true) // bit 15 clear: the facet's own colour
  }
  return out
}

interface GltfJson {
  nodes: Record<string, unknown>[]
  scenes: { nodes: number[] }[]
  materials: { name?: string }[]
  meshes: { primitives: { material?: number }[] }[]
}
/** Our own two-slot GLB (one glTF mesh, two primitives) with its JSON edited. */
function knobGlb(edit: (json: GltfJson) => void = () => undefined): ArrayBuffer {
  const glb = encodeGlb(twoSlotBoxAsset())
  const json = jsonOf(glb) as GltfJson
  json.nodes = [{ mesh: 0, name: "Knob" }]
  edit(json)
  return withJson(glb, json).slice().buffer
}

describe("runImport material slots", () => {
  it("STEP: each face colour (else the body's) is a slot, named by its sRGB hex", async () => {
    const { parts } = await runImport(
      job("cube-colours.step", "step", fixture("cube-colours.step")),
      decoders
    )
    expect(parts).toHaveLength(1)
    const asset = parts[0]?.asset
    expect(asset?.slots).toEqual(["#999999", "#FF0000", "#0000FF"])
    expect(asset?.faceCount).toBe(6)
    expect(asset?.volumeMm3).toBeCloseTo(1000, 3)
    const slots = slotsOf(asset?.glb)
    expect(slots.map((s) => s.last - s.first + 1)).toEqual([6, 4, 2]) // 3, 2 and 1 sides
    expect(slots[0]?.color?.[0]).toBeCloseTo(0.3185, 4) // linear, as occt reports it
    const plain = await runImport(job("cube.step", "step", fixture("cube.step")), decoders)
    expect(plain.parts[0]?.asset.slots).toEqual([])
  }, 30_000)

  it("binary STL with COLOR=: facet colours become slots", async () => {
    const { parts } = await runImport(job("box.stl", "stl", colouredStl()), decoders)
    expect(parts[0]?.asset.slots).toEqual(["#FF0000", "#008000"])
    expect(parts[0]?.asset.watertight).toBe(true)
  })

  it("OBJ: usemtl sections of one object are slots named after them, coloured by Kd", async () => {
    const obj =
      "mtllib a.mtl\no Knob\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nusemtl red\nf 1 2 3\nusemtl blue\nf 1 3 4\n"
    const mtlText = "newmtl red\nKd 1 0 0\nnewmtl blue\nKd 0 0 1\n"
    const { parts } = await runImport(job("knob.obj", "obj", text(obj), { mtlText }), decoders)
    expect(parts.map((p) => [p.name, p.asset.slots])).toEqual([["Knob", ["red", "blue"]]])
    expect(slotsOf(parts[0]?.asset.glb).map((s) => s.color)).toEqual([
      [1, 0, 0],
      [0, 0, 1],
    ])
  })

  it('split "single" keeps every mesh\'s colour as a slot', async () => {
    const obj =
      "mtllib a.mtl\no A\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl red\nf 1 2 3\no B\nv 0 0 1\nv 1 0 1\nv 0 1 1\nusemtl blue\nf 4 5 6\n"
    const mtlText = "newmtl red\nKd 1 0 0\nnewmtl blue\nKd 0 0 1\n"
    const options = { ...DEFAULT_IMPORT_OPTIONS, split: "single" as const }
    const { parts } = await runImport(
      job("pair.obj", "obj", text(obj), { mtlText, options }),
      decoders
    )
    expect(parts.map((p) => [p.name, p.asset.slots])).toEqual([["pair", ["red", "blue"]]])
  })

  it("warns when a mesh has more materials than slots", async () => {
    const sections = Array.from({ length: 70 }, (_, i) => `usemtl m${i}\nf 1 2 3\n`).join("")
    const obj = `o Many\nv 0 0 0\nv 1 0 0\nv 0 1 0\n${sections}`
    const { parts, warnings } = await runImport(job("many.obj", "obj", text(obj)), decoders)
    expect(parts[0]?.asset.slots).toHaveLength(64)
    expect(warnings).toEqual([
      'many.obj: "Many" has more than 64 materials; the rest share the last one.',
    ])
  })

  it("glTF: a mesh's primitives are one part, its glTF materials the slots", async () => {
    const { parts } = await runImport(job("knob.glb", "glb", knobGlb()), decoders)
    expect(parts.map((p) => [p.name, p.asset.slots])).toEqual([["Knob", ["Body", "Trim"]]])
    expect(parts[0]?.asset.triangleCount).toBe(12)
    expect(parts[0]?.asset.watertight).toBe(true) // the slot seam is welded
  })

  it("glTF: unnamed materials are named by index, no material is Default", async () => {
    const unnamed = knobGlb((j) => delete j.materials[1]?.name)
    const a = await runImport(job("a.glb", "glb", unnamed), decoders)
    expect(a.parts[0]?.asset.slots).toEqual(["Body", "material_1"])
    const none = knobGlb((j) => delete j.meshes[0]?.primitives[1]?.material)
    const b = await runImport(job("b.glb", "glb", none), decoders)
    expect(b.parts[0]?.asset.slots).toEqual(["Body", "Default"])
    expect(slotsOf(b.parts[0]?.asset.glb)[1]?.color).toEqual([1, 1, 1]) // glTF's default
  })

  it("glTF: an instanced multi-primitive mesh gives one part per node, one shared asset", async () => {
    const twice = knobGlb((j) => {
      j.nodes.push({ mesh: 0, name: "Knob 2", translation: [1, 0, 0] })
      j.scenes = [{ nodes: [0, 1] }]
    })
    const { parts } = await runImport(job("knobs.glb", "glb", twice), decoders)
    expect(parts.map((p) => [p.name, p.asset.slots])).toEqual([
      ["Knob", ["Body", "Trim"]],
      ["Knob 2", ["Body", "Trim"]],
    ])
    expect(parts[0]?.asset.id).toBe(parts[1]?.asset.id)
    expect(parts[1]?.asset.offsetMm[0]).toBeCloseTo(1000, 3)
  })

  it("glTF: only the imported scene counts, so its mesh still groups its primitives", async () => {
    const scenes = knobGlb((j) => {
      j.nodes.push({ mesh: 0, name: "Other" })
      j.scenes = [{ nodes: [0] }, { nodes: [1] }]
    })
    const { parts } = await runImport(job("scenes.glb", "glb", scenes), decoders)
    expect(parts.map((p) => [p.name, p.asset.slots])).toEqual([["Knob", ["Body", "Trim"]]])
  })

  it('glTF split "single": one-primitive meshes keep their material names as slots', async () => {
    const split = knobGlb((j) => {
      const [body, trim] = j.meshes[0]?.primitives ?? []
      j.meshes = [{ primitives: body ? [body] : [] }, { primitives: trim ? [trim] : [] }]
      j.nodes = [
        { mesh: 0, name: "A" },
        { mesh: 1, name: "B" },
      ]
      j.scenes = [{ nodes: [0, 1] }]
    })
    const options = { ...DEFAULT_IMPORT_OPTIONS, split: "single" as const }
    const { parts } = await runImport(job("pair.glb", "glb", split, { options }), decoders)
    expect(parts.map((p) => [p.name, p.asset.slots])).toEqual([["pair", ["Body", "Trim"]]])
  })
})
