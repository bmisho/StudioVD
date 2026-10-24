// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { encodeGlb } from "@/core/geometry/glbWrite"
import { twoSlotBoxAsset } from "@/core/geometry/testing/shapes"
import type { AssetId, GeometryAsset } from "@/core/schema"
import { decodeAsset } from "./assetDecode"

// The worker decodes in-process here; the GLB comes from a stubbed fetch. Snap requests wait
// until the test settles them.
const pendingSnaps = vi.hoisted(
  () => [] as { reject: (e: unknown) => void; resolve: (v: unknown) => void }[]
)
vi.mock("./assetWorkerPool", () => ({
  decodeInWorker: (bytes: ArrayBuffer) => Promise.resolve(decodeAsset(new Uint8Array(bytes))),
  edgesInWorker: () => Promise.resolve(new Uint32Array(0)),
  snapsInWorker: () => new Promise((resolve, reject) => pendingSnaps.push({ resolve, reject })),
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

  it("a snap request that fails after its asset was released does not stick", async () => {
    const glb = encodeGlb(twoSlotBoxAsset())
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(glb.slice().buffer)))
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const { assetCache } = await import("./assetCache")
    const id = "cd".repeat(32) as AssetId
    assetCache.request(id)
    await vi.waitFor(() => expect(assetCache.get(id)).toBeDefined())
    assetCache.requestSnaps(id)
    expect(pendingSnaps).toHaveLength(1)
    assetCache.retain(new Set()) // a new document: the asset is freed
    pendingSnaps[0]?.reject(new Error("worker died")) // e.g. another asset crashed it
    await vi.waitFor(() => expect(assetCache.get(id)).toBeUndefined())
    await Promise.resolve()

    assetCache.request(id) // the next document uses it again
    await vi.waitFor(() => expect(assetCache.get(id)).toBeDefined())
    assetCache.requestSnaps(id)
    expect(pendingSnaps).toHaveLength(2)
    const features = { corners: [], edges: [], cylinderSense: new Int8Array(0) }
    pendingSnaps[1]?.resolve(features)
    await vi.waitFor(() => expect(assetCache.snaps(id)).toBe(features))
  })
})
