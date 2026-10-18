import { describe, expect, it } from "vitest"
import { physicsModelFromDocument } from "@/core/physics/physicsModel"
import { sampleDocument } from "@/core/schema/testing/sampleDocument"
import { stableModel } from "./physicsRun"

describe("stableModel", () => {
  it("keeps the running world for appearance edits, restarts it for density", () => {
    const doc = sampleDocument()
    const first = stableModel(physicsModelFromDocument(doc))
    const material = Object.values(doc.materials).find((m) =>
      Object.values(doc.parts).some((p) => p.materialId === m.id)
    )
    if (!material) throw new Error("no assigned material")
    material.color = "#ff0000"
    material.roughness = 0.9
    expect(stableModel(physicsModelFromDocument(doc))).toBe(first)
    material.densityKgM3 = 1000
    expect(stableModel(physicsModelFromDocument(doc))).not.toBe(first)
  })
})
