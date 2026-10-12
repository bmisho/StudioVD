import { describe, expect, it } from "vitest"
import { COLLECTION_CAPS, SCENE_LIMITS } from "./caps"
import type { SceneDocument } from "./document"
import type { AnchorId, AssetId, GroupId, MateId, PartId } from "./ids"
import { checkIntegrity, missingFiles } from "./integrity"
import { sampleDocument, uuid } from "./testing/sampleDocument"

const first = <T>(record: Record<string, T>): [string, T] => {
  const entry = Object.entries(record)[0]
  if (!entry) throw new Error("empty collection")
  return entry
}
const paths = (doc: SceneDocument) => checkIntegrity(doc).map((p) => p.path)

describe("checkIntegrity", () => {
  it("passes a sound document", () => {
    expect(checkIntegrity(sampleDocument())).toEqual([])
  })

  it("requires every record key to equal its entity's id", () => {
    const doc = sampleDocument()
    const [key, part] = first(doc.parts)
    doc.parts[key as PartId] = { ...part, id: uuid(9) as PartId }
    expect(checkIntegrity(doc)).toContainEqual({
      path: `parts.${key}.id`,
      message: "does not match its key",
    })
  })

  it("requires minted ids to be unique across kinds", () => {
    const doc = sampleDocument()
    const [groupId] = first(doc.groups)
    const [, part] = first(doc.parts)
    doc.anchors[groupId as AnchorId] = {
      id: groupId as AnchorId,
      partId: part.id,
      kind: "point",
      frame: { originMm: [0, 0, 0], z: [0, 0, 1], x: [1, 0, 0] },
      source: { kind: "manual" },
    }
    expect(checkIntegrity(doc)).toContainEqual({
      path: `anchors.${groupId}`,
      message: "id already used in groups",
    })
  })

  it("requires every reference to resolve, own properties only", () => {
    const cases: ((doc: SceneDocument, missing: string) => string)[] = [
      (d, m) => breakFirst(d.parts, "parts", "assetId", m),
      (d, m) => breakFirst(d.parts, "parts", "parentId", m),
      (d, m) => breakFirst(d.parts, "parts", "materialId", m),
      (d, m) => breakFirst(d.groups, "groups", "parentId", m),
      (d, m) => breakFirst(d.anchors, "anchors", "partId", m),
      (d, m) => breakFirst(d.mates, "mates", "anchorB", m),
    ]
    for (const breakIt of cases)
      for (const missing of [uuid(77), "toString", "constructor"]) {
        const doc = sampleDocument()
        const path = breakIt(doc, missing)
        expect(checkIntegrity(doc)).toContainEqual({
          path,
          message: "refers to something that is missing",
        })
      }
  })

  it("refuses a mate whose anchors sit on one part", () => {
    const doc = sampleDocument()
    const [mateId, mate] = first(doc.mates)
    const a = doc.anchors[mate.anchorA]
    if (!a) throw new Error("anchor missing")
    doc.anchors[mate.anchorB] = { ...a, id: mate.anchorB }
    expect(paths(doc)).toEqual([`mates.${mateId}`])
  })

  it("refuses group parent cycles of any length", () => {
    for (const length of [1, 2, 3]) {
      const doc = sampleDocument()
      const ids = Array.from({ length }, (_, i) => uuid(200 + i) as GroupId)
      ids.forEach((id, i) => {
        doc.groups[id] = { id, name: "G", parentId: ids[(i + 1) % length] ?? null }
      })
      expect(paths(doc).sort()).toEqual(ids.map((id) => `groups.${id}.parentId`).sort())
    }
  })

  it("refuses groups nested deeper than the limit, and only those", () => {
    const doc = sampleDocument()
    const ids = Array.from({ length: SCENE_LIMITS.maxGroupDepth + 1 }, (_, i) => uuid(300 + i))
    ids.forEach((id, i) => {
      doc.groups[id as GroupId] = {
        id: id as GroupId,
        name: "G",
        parentId: (ids[i - 1] ?? null) as GroupId | null,
      }
    })
    expect(paths(doc)).toEqual([`groups.${ids.at(-1)}.parentId`])
  })

  it("refuses collections over their cap before checking anything else", () => {
    const doc = sampleDocument()
    const [, asset] = first(doc.assets)
    for (let i = 0; i <= COLLECTION_CAPS.assets; i++) {
      const id = i.toString(16).padStart(64, "0") as AssetId
      doc.assets[id] = { ...asset, id }
    }
    expect(checkIntegrity(doc)).toEqual([
      {
        path: "assets",
        message: `${COLLECTION_CAPS.assets + 3} entries; at most 10000 are allowed`,
      },
    ])
  })

  it("caps the number of problems it reports", () => {
    const doc = sampleDocument()
    for (let i = 0; i < 80; i++) {
      const [, mate] = first(doc.mates)
      const id = uuid(1000 + i) as MateId
      doc.mates[id] = { ...mate, id, anchorA: uuid(5000 + i) as AnchorId }
    }
    expect(checkIntegrity(doc)).toHaveLength(50)
  })
})

describe("missingFiles", () => {
  it("lists the asset files a bundle lacks", () => {
    const doc = sampleDocument()
    const assetPaths = Object.values(doc.assets).map((a) => a.path)
    expect(missingFiles(doc, new Set(assetPaths))).toEqual([])
    expect(missingFiles(doc, new Set(assetPaths.slice(1)))).toEqual([assetPaths[0]])
  })
})

/** Points `field` of the collection's first entity at `missing`; returns the problem path. */
function breakFirst(collection: object, name: string, field: string, missing: string): string {
  const [key, entity] = first(collection as Record<string, object>)
  Object.assign(entity, { [field]: missing })
  return `${name}.${key}.${field}`
}
