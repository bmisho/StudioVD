import { describe, expect, it } from "vitest"
import { createEmptyDocument, parseDocument, type SceneDocument } from "./document"
import { MateSchema } from "./assembly"
import { GroupIdSchema, newId, type AnchorId, type GroupId, type MateId, type PartId } from "./ids"
import { GeometryAssetSchema } from "./scene"

const valid = (): SceneDocument => createEmptyDocument("0.1.0")

describe("scene.json v1 schema", () => {
  it("accepts a fresh empty document", () => {
    expect(parseDocument(valid()).ok).toBe(true)
  })

  it("round-trips through JSON unchanged", () => {
    const doc = valid()
    const id = newId<GroupId>()
    doc.groups[id] = { id, name: "Frame", parentId: null }
    const parsed = parseDocument(JSON.parse(JSON.stringify(doc)))
    expect(parsed).toEqual({ ok: true, document: doc })
  })

  it("rejects unknown top-level keys (strict objects)", () => {
    const result = parseDocument({ ...valid(), extra: 1 })
    expect(result.ok).toBe(false)
  })

  it("rejects a different schema version", () => {
    expect(parseDocument({ ...valid(), schemaVersion: 2 }).ok).toBe(false)
  })

  it("rejects non-finite numbers", () => {
    const doc = valid()
    doc.simulation.gravity = [0, Number.POSITIVE_INFINITY, 0]
    expect(parseDocument(doc).ok).toBe(false)
  })

  it("rejects a part whose quaternion is not unit length, with a useful path", () => {
    const doc = valid()
    const partId = newId<PartId>()
    const json = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>
    json.parts = {
      [partId]: {
        id: partId,
        name: "Bracket",
        assetId: "a".repeat(64),
        parentId: null,
        pose: { positionMm: [0, 0, 0], quaternion: [0, 0, 0, 2] },
        materialId: null,
        grounded: true,
        visible: true,
        collider: "hull",
      },
    }
    const result = parseDocument(json)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.endsWith("pose.quaternion"))).toBe(true)
    }
  })

  it("rejects empty or whitespace-only group names", () => {
    const doc = valid()
    const id = newId<GroupId>()
    doc.groups[id] = { id, name: "   ", parentId: null }
    expect(parseDocument(doc).ok).toBe(false)
  })

  it("rejects library components until Phase 9 defines the manifest schema", () => {
    const key = "std/m3@1.0.0#0123456789ab"
    const def = { key, id: "std/m3", version: "1.0.0", manifestSha256: "a".repeat(64) }
    const doc = {
      ...valid(),
      componentDefs: { [key]: { ...def, origin: "official", manifest: {} } },
    }
    expect(parseDocument(doc).ok).toBe(false)
  })

  it("ties an asset's path to its content address and keeps its bounds ordered", () => {
    const id = "a".repeat(64)
    const asset = {
      id,
      path: `geometry/${id}.glb`,
      triangleCount: 12,
      bboxMm: { min: [-1, -1, -1], max: [1, 1, 1] },
    }
    expect(GeometryAssetSchema.safeParse(asset).success).toBe(true)
    const otherPath = { ...asset, path: `geometry/${"b".repeat(64)}.glb` }
    expect(GeometryAssetSchema.safeParse(otherPath).success).toBe(false)
    const inverted = { ...asset, bboxMm: { min: [0, 2, 0], max: [1, 1, 1] } }
    expect(GeometryAssetSchema.safeParse(inverted).success).toBe(false)
  })

  it("accepts only lowercase UUIDs as minted ids", () => {
    expect(GroupIdSchema.safeParse(newId<GroupId>()).success).toBe(true)
    for (const id of ["constructor", "a".repeat(64), "00000000-0000-4000-8000-00000000000A"])
      expect(GroupIdSchema.safeParse(id).success).toBe(false)
  })

  it("rejects a mate between an anchor and itself", () => {
    const anchor = newId<AnchorId>()
    const mate = {
      id: newId<MateId>(),
      type: "fixed",
      anchorA: anchor,
      anchorB: anchor,
      flip: false,
      angleOffsetRad: 0,
      contactsEnabled: false,
      suppressed: false,
    }
    expect(MateSchema.safeParse(mate).success).toBe(false)
  })

  it("never throws on garbage input", () => {
    for (const input of [null, 42, "scene", [], { format: "studiovd" }]) {
      expect(parseDocument(input).ok).toBe(false)
    }
  })
})
