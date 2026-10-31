import { describe, expect, it } from "vitest"
import {
  createEmptyDocument,
  newId,
  type AnchorId,
  type AssetId,
  type GeometryAsset,
  type MateId,
  type PartId,
  type SceneDocument,
} from "@/core/schema"
import { at, generated } from "../testing/generatedComponent"
import { buildUserComponent, type UserComponentForm } from "./build"
import { planUserComponent } from "./plan"

const FORM: UserComponentForm = {
  name: "Spindle",
  slug: "spindle",
  version: "1.0.0",
  category: "mechanical",
  tags: ["spindle"],
  designatorPrefix: "SP",
  summary: "",
  licence: "cc-by-4.0",
  author: "Ada",
}
const sizes = (doc: SceneDocument) => new Map(Object.keys(doc.assets).map((id) => [id, 1234]))
const ctx = (doc: SceneDocument) => ({
  namespace: "u-abcdef",
  appVersion: "0.1.0",
  createdAt: "2026-10-31T12:00:00Z",
  glbBytes: sizes(doc),
})

function build(doc: SceneDocument, parts: PartId[], form = FORM) {
  const plan = planUserComponent(doc, parts)
  if (typeof plan === "string") throw new Error(plan)
  const out = buildUserComponent(doc, plan, form, ctx(doc))
  if ("error" in out) throw new Error(out.error)
  return { plan, manifest: out.manifest }
}

describe("Save as component of plain parts", () => {
  it("names plain parts, keeps internal mates only and leaves imported colours alone", async () => {
    const box = await generated("primitive.box", { widthMm: 10, heightMm: 10, depthMm: 10 })
    const doc = createEmptyDocument("0.1.0")
    const asset = Object.values(box.assets)[0] as GeometryAsset
    doc.assets[asset.id] = asset
    const part = (name: string, x: number) => {
      const id = newId<PartId>()
      doc.parts[id] = {
        id,
        name,
        assetId: asset.id,
        parentId: null,
        pose: at(x, 0, 0),
        materialId: null,
        grounded: x === 10,
        visible: true,
        collider: "hull",
      }
      const anchor = newId<AnchorId>()
      doc.anchors[anchor] = {
        id: anchor,
        partId: id,
        kind: "planar",
        frame: { originMm: [0, 1, 0], z: [0, 1, 0], x: [1, 0, 0] },
        source: { kind: "manual" },
      }
      return { id, anchor }
    }
    const [a, b, c] = [part("Ø8 Bracket", 0), part("Ø8 Bracket", 10), part("Base", 20)]
    const mate = (x: AnchorId, y: AnchorId) => {
      const id = newId<MateId>()
      doc.mates[id] = {
        id,
        type: "revolute",
        anchorA: x,
        anchorB: y,
        flip: false,
        angleOffsetRad: 0,
        contactsEnabled: false,
        suppressed: false,
      }
    }
    mate(a.anchor, b.anchor)
    mate(b.anchor, c.anchor)
    const { plan, manifest } = build(doc, [a.id, b.id])
    expect(plan.root.id).toBe(b.id) // the grounded one
    expect(plan.skipped.externalMates).toBe(1)
    expect(Object.keys(manifest.parts)).toEqual(["part_8_Bracket", "part_8_Bracket_2"])
    expect(manifest.rootPart).toBe("part_8_Bracket_2")
    expect(manifest.parts.part_8_Bracket?.transform.positionMm).toEqual([-10, 0, 0])
    expect(manifest.parts.part_8_Bracket?.material).toBeUndefined()
    expect(manifest.materials).toEqual({})
    expect(Object.values(manifest.mates)).toMatchObject([
      { name: "Revolute 1", anchorA: "anchor", anchorB: "anchor_2" },
    ])
    expect(manifest.placement.groundIfFirst).toBe(true)
  })

  it("says why it cannot save", () => {
    const doc = createEmptyDocument("0.1.0")
    expect(planUserComponent(doc, [])).toMatch(/Select the parts/)
    const ids = Array.from({ length: 65 }, () => {
      const id = newId<PartId>()
      doc.parts[id] = {
        id,
        name: "P",
        assetId: "a".repeat(64) as AssetId,
        parentId: null,
        pose: at(0, 0, 0),
        materialId: null,
        grounded: false,
        visible: true,
        collider: "hull",
      }
      return id
    })
    expect(planUserComponent(doc, ids)).toMatch(/at most 64/)
    const plan = planUserComponent(doc, ids.slice(0, 1))
    if (typeof plan === "string") throw new Error(plan)
    expect(buildUserComponent(doc, plan, FORM, ctx(doc))).toEqual({
      error: "P has no geometry to save.",
    })
  })
})
