// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type * as GlbFormatModule from "./glbFormat"
import { decodeGlb } from "./glbRead"
import { encodeGlb } from "./glbWrite"
import { prepareAsset } from "./prepareAsset"
import { boxAsset, boxMesh } from "./testing/shapes"

type GlbFormat = typeof GlbFormatModule

// A small cap stands in for the real one (a million faces), which would need a huge mesh.
vi.mock("./glbFormat", async (original) => ({
  ...(await original<GlbFormat>()),
  MAX_FACES: 4,
}))

describe("face cap", () => {
  it("a mesh coloured per triangle stores one face per slot past the cap, and decodes", async () => {
    const box = boxMesh(4, 5, 6)
    const asset = await prepareAsset(
      {
        name: "speckled",
        ...box,
        slots: [
          { name: null, color: [1, 0, 0] },
          { name: null, color: [0, 0, 1] },
        ],
        triangleSlots: Uint16Array.from({ length: 12 }, (_, t) => t % 2), // 12 faces uncapped
      },
      { mmPerUnit: 1, upAxis: "y" }
    )
    expect(asset?.faceCount).toBe(2)
    expect(decodeGlb(asset?.glb ?? new Uint8Array()).faces).toHaveLength(2)
  })

  it("the writer refuses more faces than the reader accepts", () => {
    const asset = boxAsset()
    const faces = Array.from({ length: 5 }, () => ({ first: 0, last: 11, kind: "other" as const }))
    expect(() => encodeGlb({ ...asset, faces })).toThrow(/faces/)
  })
})
