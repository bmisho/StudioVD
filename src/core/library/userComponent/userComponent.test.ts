import { describe, expect, it } from "vitest"
import { mergeBatch } from "@/core/scene/entityBatch"
import {
  ComponentManifestSchema,
  createEmptyDocument,
  type AssetId,
  type GeometryAsset,
  type PartId,
  type SceneDocument,
} from "@/core/schema"
import fixture from "@/core/schema/testing/fixtures/library/component-asset.valid.json"
import { assetFromManifest } from "../assetRecords"
import { definitionOf } from "../definition"
import { instantiateComponent } from "../instantiate"
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

describe("Save as component", () => {
  it("keeps an inserted bearing's keys, mate and look, and re-inserts it where it was", async () => {
    const bearing = await generated("bearing.deepGroove", {
      boreMm: 8,
      outerMm: 22,
      widthMm: 7,
      seal: "2RS",
    })
    const pose = {
      positionMm: [5, 6, 7] as [number, number, number],
      quaternion: [0, 0.6, 0, 0.8] as [number, number, number, number],
    }
    const first = instantiateComponent(createEmptyDocument("0.1.0"), { ...bearing, pose })
    const doc = mergeBatch(createEmptyDocument("0.1.0"), first.batch)
    const ids = Object.keys(doc.parts) as PartId[]
    const { plan, manifest } = build(doc, ids)
    expect(plan.skipped).toEqual({ externalMates: 0, suppressedMates: 0, connectors: 0 })
    expect(Object.keys(manifest.parts).sort()).toEqual(["inner", "outer"])
    expect(Object.keys(manifest.mates)).toEqual(["spin"])
    expect(Object.keys(manifest.anchors).sort()).toEqual(
      Object.keys(bearing.def.manifest.anchors).sort()
    )
    expect(manifest.materials).toEqual({
      Steel: { kind: "builtin", key: "std.steel" },
      Rubber: { kind: "builtin", key: "std.rubber" },
    })
    expect(manifest.parts.outer?.materialSlots).toEqual([{ slot: "Seals", material: "Rubber" }])
    // Ours (a generator, CC0) adds nothing to inherit: the user's grant is the whole licence.
    expect(manifest.license.inherited).toBeUndefined()
    expect(manifest.license.geometry).toMatchObject({
      spdx: "CC-BY-4.0",
      attributionRequired: true,
      creators: [{ name: "Ada" }],
      copyright: "© 2026 Ada",
    })
    expect(manifest.identity).toMatchObject({
      id: "u-abcdef/spindle",
      designatorPrefix: "SP",
      requires: { app: ">=0.1.0" },
    })
    expect(manifest.parts.outer?.geometry).toMatchObject({ kind: "asset", bytes: 1234 })

    // Inserted at the root part's pose, every part lands where it was.
    const def = await definitionOf(
      ComponentManifestSchema.parse(JSON.parse(JSON.stringify(manifest))),
      "user"
    )
    const assets: Record<string, GeometryAsset> = {}
    for (const [key, p] of Object.entries(def.manifest.parts))
      if (p.geometry.kind === "asset")
        assets[key] = doc.assets[p.geometry.sha256 as AssetId] as GeometryAsset
    const root = plan.root
    const again = instantiateComponent(doc, { def, assets, pose: root.pose })
    const next = mergeBatch(doc, again.batch)
    const record = next.components[again.instance]
    const parts = Object.entries(record?.parts ?? {})
    expect(parts).toHaveLength(2)
    for (const [key, id] of parts) {
      const was = (first.batch.parts ?? []).find((p) => p.componentRef?.key === key)
      const copy = next.parts[id]
      if (!was || !copy) throw new Error(`no ${key}`)
      copy.pose.positionMm.forEach((v, i) =>
        expect(v).toBeCloseTo(was.pose.positionMm[i] ?? NaN, 9)
      )
      copy.pose.quaternion.forEach((v, i) =>
        expect(v).toBeCloseTo(was.pose.quaternion[i] ?? NaN, 9)
      )
    }
    expect(Object.keys(record?.mates ?? {})).toEqual(["spin"])
  })

  it("inherits a library part's licence and refuses to drop it", async () => {
    const manifest = ComponentManifestSchema.parse(fixture)
    const def = await definitionOf(manifest, "sideloaded")
    const ref = manifest.parts.body?.geometry
    if (ref?.kind !== "asset") throw new Error("fixture")
    const knob = instantiateComponent(createEmptyDocument("0.1.0"), {
      def,
      assets: { body: assetFromManifest(ref, manifest.license.geometry) },
      pose: at(0, 0, 0),
    })
    const doc = mergeBatch(createEmptyDocument("0.1.0"), knob.batch)
    const out = build(doc, Object.keys(doc.parts) as PartId[], {
      ...FORM,
      licence: "private",
      author: "",
    })
    const licence = out.manifest.license
    expect(licence.inherited).toEqual([
      { component: "acme/knob-15mm", version: "2.1.0-beta.1", grant: manifest.license.geometry },
    ])
    expect(licence.geometry).toMatchObject({
      spdx: "LicenseRef-StudioVD-UserPrivate AND CC-BY-4.0",
      attributionRequired: true,
      redistributable: false,
      creators: [],
    })
    expect(licence.geometry.licenseUrl).toBeUndefined()
    expect(licence.data.spdx).toBe("LicenseRef-StudioVD-UserPrivate")
    // Unlinked, the part still carries its asset's licence; the definition still names it.
    const unlinked = structuredClone(doc)
    for (const p of Object.values(unlinked.parts)) delete p.componentRef
    expect(
      build(unlinked, Object.keys(doc.parts) as PartId[]).manifest.license.inherited?.[0]?.component
    ).toBe("acme/knob-15mm")
    // Without the definition, the asset's licence alone is inherited.
    unlinked.componentDefs = {}
    unlinked.components = {}
    expect(build(unlinked, Object.keys(doc.parts) as PartId[]).manifest.license.inherited).toEqual([
      { grant: manifest.license.geometry },
    ])
  })
})
