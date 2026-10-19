// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { encodeGlb } from "@/core/geometry/glbWrite"
import { twoSlotBoxAsset } from "@/core/geometry/testing/shapes"
import type { AssetId, GeometryAsset } from "@/core/schema"
import { decodeAsset } from "./assetDecode"

// The worker decodes in-process here; the GLB comes from a stubbed fetch.
vi.mock("./assetWorkerPool", () => ({
  decodeInWorker: (bytes: ArrayBuffer) => Promise.resolve(decodeAsset(new Uint8Array(bytes))),
  edgesInWorker: () => Promise.resolve(new Uint32Array(0)),
}))
vi.mock("@/lib/tauri/files", () => ({ assetUrl: (id: string) => `stvd://${id}` }))

const ID = "ab".repeat(32) as AssetId
const record = (slots?: string[]): GeometryAsset => ({
  id: ID,
  path: `geometry/${ID}.glb`,
  triangleCount: 12,
  bboxMm: { min: [-5, -10, -15], max: [5, 10, 15] },
  watertight: true,
  ...(slots ? { slots } : {}),
})

describe("asset cache", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("uses a GLB only when its slots are the ones the document lists", async () => {
    const glb = encodeGlb(twoSlotBoxAsset()) // slots Body, Trim
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(glb.slice().buffer)))
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const { assetCache } = await import("./assetCache")
    assetCache.request(ID)
    await vi.waitFor(() => expect(assetCache.get(ID)).toBeDefined())
    expect(assetCache.getFor(record(["Body", "Trim"]))).toBeDefined()
    expect(assetCache.getFor(record(["Body", "Lens"]))).toBeUndefined() // edited file
    expect(assetCache.getFor(record())).toBeUndefined() // says one slot, GLB has two
  })
})
