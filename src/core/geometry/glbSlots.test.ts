// @vitest-environment node
import { createHash } from "node:crypto"
import type { Group, Mesh } from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { describe, expect, it } from "vitest"
import type { AssetGeometry } from "./glbFormat"
import { decodeGlb, slotAt } from "./glbRead"
import { encodeGlb } from "./glbWrite"
import { jsonOf, withJson } from "./testing/glbJson"
import { boxAsset, gridMesh, twoSlotBoxAsset } from "./testing/shapes"

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const uncoloured = (asset: AssetGeometry): AssetGeometry => ({
  ...asset,
  slots: asset.slots.map((s) => ({ ...s, color: null })),
})

interface Json {
  accessors: { byteOffset?: number; count: number }[]
  meshes: { primitives: { attributes: Record<string, number>; material?: number }[] }[]
  materials: { name?: string; pbrMetallicRoughness: object }[]
  [key: string]: unknown
}
/** The two-slot box's GLB with its JSON edited. */
const tampered = (edit: (json: Json) => void) => {
  const glb = encodeGlb(twoSlotBoxAsset())
  const json = jsonOf(glb) as Json
  edit(json)
  return withJson(glb, json)
}

describe("GLB material slots", () => {
  it("writes single-slot assets as version 1, byte for byte (hashes from the Phase 5 encoder)", () => {
    // Computed with the encoder at commit 27c2d8c, before slots existed: re-imports of the
    // same files still dedup against assets in existing projects.
    expect(sha(encodeGlb(boxAsset()))).toBe(
      "439be625e3da9b9958fccdce02f6ba1ab1196528b1816b7502b729ac1c3491db"
    )
    expect(sha(encodeGlb(uncoloured(boxAsset())))).toBe(
      "738d9136e4f6a058c978faba17498c602a39906578f839c76aafc949b40c7c92"
    )
    const painted = uncoloured(boxAsset())
    painted.mesh.colors = new Float32Array(painted.mesh.positions.length).fill(0.5)
    expect(sha(encodeGlb(painted))).toBe(
      "05f66a5bb11c8a578c41d3855f5f2250301cbfb481551db13e53d13467605924"
    )
    const grid = gridMesh(300) // 90 000 vertices: 32-bit indices
    const last = grid.indices.length / 3 - 1
    const asset: AssetGeometry = {
      mesh: grid,
      hullNormals: grid.normals.slice(),
      faces: [
        { first: 0, last: 99, kind: "plane", normal: [0, 0, 1], point: [0, 0, 0] },
        { first: 100, last, kind: "cylinder", axis: [0, 1, 0], point: [1, 2, 3], radiusMm: 4.5 },
      ],
      slots: [{ name: null, color: [0.25, 0.5, 0.75], first: 0, last }],
    }
    expect(sha(encodeGlb(asset))).toBe(
      "50bf12da9704c7fe58ba4a695d7e6ad003442996506db56145bb953140e42d94"
    )
  })

  it("round-trips several slots: names, colours, ranges and faces", () => {
    const asset = twoSlotBoxAsset()
    const back = decodeGlb(encodeGlb(asset))
    expect(back.mesh.indices).toEqual(asset.mesh.indices)
    expect(back.faces).toEqual(asset.faces)
    expect(back.slots).toEqual([
      { name: "Body", color: [0.8, 0.1, 0.1], first: 0, last: 7 }, // JSON keeps doubles
      { name: "Trim", color: null, first: 8, last: 11 },
    ])
  })

  it("is plain glTF: one primitive per slot over shared attributes, materials named", async () => {
    const glb = encodeGlb(twoSlotBoxAsset())
    const json = jsonOf(glb) as Json
    const [a, b] = json.meshes[0]?.primitives ?? []
    expect(a?.attributes).toEqual(b?.attributes)
    expect(json.accessors.slice(-2).map((x) => [x.byteOffset ?? 0, x.count])).toEqual([
      [0, 24],
      [48, 12], // 8 triangles x 3 indices x 2 bytes
    ])
    expect(json.materials.map((m) => m.name)).toEqual(["Body", "Trim"])
    expect(jsonOf(encodeGlb(twoSlotBoxAsset()))).toEqual(json) // deterministic
    const gltf = await new GLTFLoader().parseAsync(glb.slice().buffer, "")
    const group = gltf.scene.children[0] as Group
    const meshes = group.children as Mesh[]
    expect(meshes.map((m) => (m.material as { name: string }).name)).toEqual(["Body", "Trim"])
    expect(meshes.map((m) => m.geometry.getIndex()?.count)).toEqual([24, 12])
  })

  it("refuses slots that do not tile the triangles in order", () => {
    const asset = twoSlotBoxAsset()
    const [body, trim] = asset.slots
    if (!body || !trim) throw new Error("no slots")
    const bad = (slots: AssetGeometry["slots"]) => () => encodeGlb({ ...asset, slots })
    expect(bad([])).toThrow(/at least one/)
    expect(bad([body, { ...trim, first: 9 }])).toThrow(/tile/)
    expect(bad([body, { ...trim, first: 7 }])).toThrow(/tile/)
    expect(bad([trim, body])).toThrow(/tile/)
    expect(bad([body])).toThrow(/cover/)
    expect(bad([body, { ...trim, name: null }])).toThrow(/names/)
  })

  it("refuses slot structures the writer never makes", () => {
    const reads = (edit: (json: Json) => void) => () => decodeGlb(tampered(edit))
    expect(reads(() => undefined)).not.toThrow()
    const primitives = (j: Json) => j.meshes[0]?.primitives ?? []
    expect(
      reads((j) => {
        const p = primitives(j)[1]
        if (p) p.attributes = { ...p.attributes, NORMAL: 0 }
      })
    ).toThrow(/attributes/)
    expect(
      reads((j) => {
        const second = j.accessors.at(-1)
        if (second) second.byteOffset = 0 // overlaps the first window
      })
    ).toThrow(/consecutive/)
    expect(reads((j) => delete primitives(j)[1]?.material)).toThrow(/its material/)
    expect(
      reads((j) => {
        const [a, b] = primitives(j)
        if (a && b) [a.material, b.material] = [1, 0]
      })
    ).toThrow(/its material/)
    const named = (name: string | undefined) => (j: Json) => {
      const m = j.materials[1]
      if (m) m.name = name
    }
    expect(reads(named("Body"))).toThrow(/unique/)
    expect(reads(named(undefined))).toThrow(/unique/)
    expect(reads(named("Tr\u0001im"))).toThrow(/unique/)
    expect(reads(named(" Trim"))).toThrow(/unique/)
    expect(
      reads((j) => {
        const p = primitives(j)[0]
        if (p) j.meshes[0] = { ...j.meshes[0], primitives: Array.from({ length: 65 }, () => p) }
      })
    ).toThrow()
  })

  it("refuses a version that does not match the primitive count, and faces across slots", () => {
    const one = encodeGlb(boxAsset())
    const json = jsonOf(one) as { meshes: { extras: { studiovd: { v: number } } }[] }
    const extras = json.meshes[0]?.extras.studiovd
    if (extras) extras.v = 2
    expect(() => decodeGlb(withJson(one, json))).toThrow(/version/)
    const v1 = (j: Json) => {
      const mesh = j.meshes[0] as { extras: { studiovd: { v: number } } } | undefined
      if (mesh) mesh.extras.studiovd.v = 1
    }
    expect(() => decodeGlb(tampered(v1))).toThrow(/version/)
    const across = { ...twoSlotBoxAsset(), faces: boxAsset().faces } // one face, triangles 0-11
    expect(() => decodeGlb(encodeGlb(across))).toThrow(/spans two slots/)
  })

  it("finds the slot of a triangle", () => {
    const slots = [
      { first: 0, last: 7 },
      { first: 8, last: 8 },
      { first: 9, last: 11 },
    ].map((r) => ({ ...r, name: "s", color: null }))
    expect([0, 7, 8, 9, 11].map((t) => slotAt(slots, t))).toEqual([0, 0, 1, 2, 2])
    expect(slotAt(slots.slice(0, 1), 5)).toBe(0)
  })
})
