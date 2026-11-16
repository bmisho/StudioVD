import { describe, expect, it } from "vitest"
import { mergeBatch } from "@/core/scene/entityBatch"
import { ComponentManifestSchema, createEmptyDocument, type PartId } from "@/core/schema"
import fixture from "@/core/schema/testing/fixtures/library/component-asset.valid.json"
import { assetFromManifest } from "./assetRecords"
import { creditsText, glbCredits, projectCredits } from "./credits"
import { definitionOf } from "./definition"
import { instantiateComponent } from "./instantiate"
import { at, generated } from "./testing/generatedComponent"

async function knobProject() {
  const manifest = ComponentManifestSchema.parse(fixture)
  const ref = manifest.parts.body?.geometry
  if (ref?.kind !== "asset") throw new Error("fixture")
  const def = await definitionOf(manifest, "sideloaded")
  const assets = { body: assetFromManifest(ref, manifest.license.geometry) }
  let doc = createEmptyDocument("0.1.0")
  for (const x of [0, 50])
    doc = mergeBatch(doc, instantiateComponent(doc, { def, assets, pose: at(x, 0, 0) }).batch)
  const nut = await generated("fastener.nut", { size: "M3" })
  doc = mergeBatch(doc, instantiateComponent(doc, { ...nut, pose: at(0, 30, 0) }).batch)
  return { doc, manifest }
}

describe("project credits (PLAN 9.8)", () => {
  it("credits each library component once, with its part count; generators need none", async () => {
    const { doc, manifest } = await knobProject()
    const credits = projectCredits(doc)
    expect(credits).toEqual([
      {
        key: expect.stringContaining("#geometry") as string,
        title: "Knob 15 mm",
        origin: "acme/knob-15mm 2.1.0-beta.1",
        role: "Geometry",
        grant: manifest.license.geometry,
        parts: 2,
      },
    ])
    expect(projectCredits(doc, undefined, { data: true }).map((c) => c.role)).toEqual([
      "Geometry",
      "Data",
    ])
    // Only what an export holds: the nut alone owes nothing.
    const nut = Object.values(doc.parts).find((p) => p.name.includes("nut"))
    expect(projectCredits(doc, [nut?.id as PartId])).toEqual([])
  })

  it("keeps crediting a model after its component is unlinked and gone", async () => {
    const { doc, manifest } = await knobProject()
    const plain = structuredClone(doc)
    for (const p of Object.values(plain.parts)) delete p.componentRef
    plain.components = {}
    plain.componentDefs = {}
    const credits = projectCredits(plain)
    expect(credits).toHaveLength(1)
    expect(credits[0]).toMatchObject({
      role: "Model",
      parts: 2,
      grant: { spdx: manifest.license.geometry.spdx },
    })
  })

  it("writes the sidecar text and the glTF copyright and extras", async () => {
    const { doc } = await knobProject()
    const credits = projectCredits(doc)
    const text = creditsText(credits, "assembly.stl")
    expect(text).toContain("Credits for assembly.stl")
    expect(text).toContain("Knob 15 mm (acme/knob-15mm 2.1.0-beta.1): Geometry")
    expect(text).toContain("Licence: CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/)")
    expect(text).toContain("By: Acme Ltd")
    expect(text).toContain("Source: https://example.com/models/kn-15 @ r12")
    expect(text).toContain("Changes: STEP tessellated to GLB, recentred, Y-up")
    expect(creditsText([], "x.stl")).toBe("")
    const glb = glbCredits(credits)
    expect(glb?.copyright).toBe("(c) 2026 Acme Ltd (CC-BY-4.0)")
    expect(glb?.extras).toMatchObject({
      studiovdCredits: [
        { title: "Knob 15 mm", spdx: "CC-BY-4.0", creators: ["Acme Ltd"], sourceRevision: "r12" },
      ],
    })
    expect(glbCredits([])).toBeNull()
  })
})
