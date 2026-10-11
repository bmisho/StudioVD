import { describe, expect, it } from "vitest"
import { createEmptyDocument, type AnchorId, type AssetId, type GroupId } from "@/core/schema"
import { entityBatchProblems } from "./entityBatch"
import { createTestRig } from "./testRig"

describe("entityBatchProblems", () => {
  it("accepts the test rig into an empty document", () => {
    expect(entityBatchProblems(createEmptyDocument("0.1.0"), createTestRig())).toEqual([])
  })

  it("rejects dangling references", () => {
    const rig = createTestRig()
    const [part] = rig.parts
    const [anchor] = rig.anchors
    if (!part || !anchor) throw new Error("rig incomplete")
    const doc = createEmptyDocument("0.1.0")
    expect(entityBatchProblems(doc, { parts: [part] })).toEqual([`part ${part.id}: unknown asset`])
    expect(
      entityBatchProblems(doc, {
        assets: rig.assets,
        parts: [{ ...part, parentId: "nope" as GroupId }],
      })
    ).toEqual([`part ${part.id}: unknown group`])
    expect(entityBatchProblems(doc, { anchors: [anchor] })).toEqual([
      `anchor ${anchor.id}: unknown part`,
    ])
    const mate = rig.mates[0]
    if (!mate) throw new Error("rig incomplete")
    expect(entityBatchProblems(doc, { mates: [{ ...mate, anchorB: "x" as AnchorId }] })).toContain(
      `mate ${mate.id}: unknown anchor`
    )
  })

  it("rejects duplicate ids but allows an existing content-addressed asset", () => {
    const rig = createTestRig()
    const doc = createEmptyDocument("0.1.0")
    for (const a of rig.assets) doc.assets[a.id] = a
    for (const p of rig.parts) doc.parts[p.id] = p
    const problems = entityBatchProblems(doc, { assets: rig.assets, parts: rig.parts })
    expect(problems).toHaveLength(2)
    expect(problems.every((p) => p.endsWith("already exists"))).toBe(true)
  })

  it("rejects entities that fail their schema", () => {
    const rig = createTestRig()
    const asset = rig.assets[0]
    if (!asset) throw new Error("rig incomplete")
    const bad = { ...asset, id: "not-a-hash" as AssetId }
    expect(entityBatchProblems(createEmptyDocument("0.1.0"), { assets: [bad] })).toEqual([
      "asset not-a-hash fails its schema",
    ])
  })
})
