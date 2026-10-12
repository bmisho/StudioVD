import { describe, expect, it } from "vitest"
import {
  createEmptyDocument,
  newId,
  type AnchorId,
  type AssetId,
  type GroupId,
} from "@/core/schema"
import { entityBatchProblems } from "./entityBatch"
import { createTestRig } from "./testRig"

/** Readable fixed UUIDs: `uuid(1)` is 00000000-0000-4000-8000-000000000001. */
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`

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
        parts: [{ ...part, parentId: newId<GroupId>() }],
      })
    ).toEqual([`part ${part.id}: unknown group`])
    expect(entityBatchProblems(doc, { anchors: [anchor] })).toEqual([
      `anchor ${anchor.id}: unknown part`,
    ])
    const mate = rig.mates[0]
    if (!mate) throw new Error("rig incomplete")
    expect(
      entityBatchProblems(doc, { mates: [{ ...mate, anchorB: newId<AnchorId>() }] })
    ).toContain(`mate ${mate.id}: unknown anchor`)
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

describe("entityBatchProblems: groups", () => {
  const ids: Record<string, GroupId> = {
    outer: uuid(1) as GroupId,
    inner: uuid(2) as GroupId,
    kept: uuid(3) as GroupId,
    child: uuid(4) as GroupId,
    later: uuid(5) as GroupId,
  }
  const group = (name: string, parent: string | null) => ({
    id: ids[name] as GroupId,
    name,
    parentId: parent === null ? null : (ids[parent] as GroupId),
  })

  it("accepts groups whose parents come earlier in the batch, and parts inside them", () => {
    const rig = createTestRig()
    const parts = rig.parts.map((p) => ({ ...p, parentId: ids.inner as GroupId }))
    const batch = {
      assets: rig.assets,
      groups: [group("outer", null), group("inner", "outer")],
      parts,
    }
    expect(entityBatchProblems(createEmptyDocument("0.1.0"), batch)).toEqual([])
  })

  it("rejects unknown parents, parents listed later and duplicate groups", () => {
    const doc = createEmptyDocument("0.1.0")
    doc.groups[ids.kept as GroupId] = group("kept", null)
    expect(
      entityBatchProblems(doc, {
        groups: [group("child", "later"), group("later", null), group("kept", null)],
      })
    ).toEqual([`group ${ids.child}: unknown parent`, `group ${ids.kept} already exists`])
  })
})
