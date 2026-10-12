import { describe, expect, it } from "vitest"
import type { AssetId } from "@/core/schema"
import { sampleDocument } from "@/core/schema/testing/sampleDocument"
import { collectGarbage } from "./collectGarbage"

describe("collectGarbage", () => {
  it("returns the document itself when everything is in use", () => {
    const doc = sampleDocument()
    expect(collectGarbage(doc)).toBe(doc)
  })

  it("drops assets no part uses, without touching the original", () => {
    const doc = sampleDocument()
    const [asset] = Object.values(doc.assets)
    if (!asset) throw new Error("no asset")
    const orphan = {
      ...asset,
      id: "f".repeat(64) as AssetId,
      path: `geometry/${"f".repeat(64)}.glb`,
    }
    doc.assets[orphan.id] = orphan
    const saved = collectGarbage(doc)
    expect(Object.keys(saved.assets).sort()).toEqual(
      Object.keys(doc.assets)
        .filter((id) => id !== orphan.id)
        .sort()
    )
    expect(doc.assets[orphan.id]).toBe(orphan)
    expect(saved.parts).toBe(doc.parts)
  })

  it("drops licence texts nothing names", () => {
    const doc = sampleDocument()
    const sha = "a".repeat(64)
    doc.licenseTexts[sha] = { path: `licenses/${sha}.txt`, spdx: "MIT" }
    expect(collectGarbage(doc).licenseTexts).toEqual({})
  })
})
