// @vitest-environment node
import { describe, expect, it } from "vitest"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import type { Mesh } from "three"
import { decodeGlb } from "./glbRead"
import { encodeGlb } from "./glbWrite"
import { boxAsset } from "./testing/shapes"

const jsonLengthOf = (glb: Uint8Array) => new DataView(glb.buffer).getUint32(12, true)
const jsonOf = (glb: Uint8Array): unknown =>
  JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLengthOf(glb))))

/** Rebuilds a GLB around new JSON, keeping its BIN chunk. */
function withJson(glb: Uint8Array, json: unknown): Uint8Array {
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

describe("GLB encode/decode", () => {
  it("round-trips geometry, faces and base colour", () => {
    const asset = boxAsset()
    const back = decodeGlb(encodeGlb(asset))
    expect(back.mesh.positions).toEqual(asset.mesh.positions)
    expect(back.mesh.normals).toEqual(asset.mesh.normals)
    expect(back.mesh.indices).toEqual(asset.mesh.indices)
    expect(back.hullNormals).toEqual(asset.hullNormals)
    expect(back.faces).toEqual(asset.faces)
    expect(back.baseColor?.map((c) => Math.fround(c))).toEqual(
      asset.baseColor?.map((c) => Math.fround(c))
    )
  })

  it("is deterministic and 4-byte aligned", () => {
    const a = encodeGlb(boxAsset())
    const b = encodeGlb(boxAsset())
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0)
    expect(a.byteLength % 4).toBe(0)
  })

  it("uses 16-bit indices when they fit and keeps vertex colours", () => {
    const asset = boxAsset()
    asset.mesh.colors = new Float32Array(asset.mesh.positions.length).fill(0.5)
    const bytes = encodeGlb(asset)
    const json = jsonOf(bytes) as { accessors: { componentType: number }[] }
    expect(json.accessors.at(-1)?.componentType).toBe(5123)
    expect(decodeGlb(bytes).mesh.colors?.[0]).toBe(0.5)
  })

  it("loads in three's GLTFLoader with the hull normals as a custom attribute", async () => {
    const bytes = encodeGlb(boxAsset())
    const gltf = await new GLTFLoader().parseAsync(bytes.slice().buffer, "")
    const mesh = gltf.scene.children[0] as Mesh
    expect(mesh.geometry.getAttribute("position").count).toBe(24)
    expect(mesh.geometry.getAttribute("_hullnormal")).toBeDefined()
    expect(mesh.userData.studiovd).toEqual({ v: 1, faces: boxAsset().faces })
  })

  it("rejects corrupt files instead of reading out of bounds", () => {
    const good = encodeGlb(boxAsset())
    expect(() => decodeGlb(good.slice(0, 100))).toThrow()
    const wrongMagic = good.slice()
    wrongMagic[0] = 0
    expect(() => decodeGlb(wrongMagic)).toThrow(/glTF/)
    // Point the position accessor past the end of its buffer view.
    const json = jsonOf(good) as { accessors: { count: number }[] }
    const first = json.accessors[0]
    if (!first) throw new Error("no accessor")
    first.count = 10_000
    const bad = withJson(good, json)
    expect(() => decodeGlb(bad)).toThrow(/overruns/)
  })
})

describe("GLB reader limits", () => {
  it("rejects face ranges past the last triangle", () => {
    const asset = boxAsset()
    asset.faces = [{ first: 0, last: 12, kind: "other" }]
    expect(() => decodeGlb(encodeGlb(asset))).toThrow(/face range/)
  })

  it("rejects an index past the last vertex", () => {
    const asset = boxAsset()
    expect(() =>
      encodeGlb({ ...asset, mesh: { ...asset.mesh, indices: new Uint32Array([0, 1, 99]) } })
    ).toThrow(/out of range/)
  })
})
