import { describe, expect, it } from "vitest"
import { createEmptyDocument, type AssetId, type GeometryAsset, type PartId } from "@/core/schema"
import { triangleBudgetWarning, triangleCount } from "./triangleBudget"

const asset = (id: string, triangleCount: number): GeometryAsset => ({
  id: id as AssetId,
  path: `geometry/${id}.glb`,
  triangleCount,
  bboxMm: { min: [0, 0, 0], max: [1, 1, 1] },
})

describe("triangle budget", () => {
  it("counts every part that draws an asset, shared assets once per part", () => {
    const assets = { a: asset("a", 100), b: asset("b", 5) }
    expect(triangleCount([{ assetId: "a" as AssetId }, { assetId: "a" as AssetId }], assets)).toBe(
      200
    )
    expect(triangleCount([{ assetId: "missing" as AssetId }], assets)).toBe(0)
  })

  it("warns only when the scene ends up over budget", () => {
    const doc = createEmptyDocument("0.1.0")
    doc.assets["a" as AssetId] = asset("a", 600)
    doc.parts["p" as PartId] = { assetId: "a" as AssetId } as never
    const big = asset("b", 500)
    expect(
      triangleBudgetWarning(doc, { parts: [{ assetId: big.id }], assets: [big] }, 1000)
    ).toContain("more than the 0.0 M budget")
    expect(triangleBudgetWarning(doc, { parts: [], assets: [] }, 1000)).toBeNull()
    expect(
      triangleBudgetWarning(doc, { parts: [{ assetId: big.id }], assets: [big] }, 2_000_000)
    ).toBeNull()
    expect(
      triangleBudgetWarning(doc, {
        parts: [{ assetId: big.id }],
        assets: [{ ...big, triangleCount: 3_000_000 }],
      })
    ).toMatch(/^The scene now has 3\.0 M triangles, more than the 2\.5 M budget/)
  })
})
