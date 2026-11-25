import { describe, expect, it } from "vitest"
import type { PreparedAsset } from "@/core/geometry/prepareAsset"
import { readFootprint } from "./footprint"
import { blobUrl, checkAllowed, kicadGrants, stepHeader } from "./kicadLicence"
import { kicadManifest, padKey } from "./kicadManifest"
import { ComponentRecipeSchema } from "./recipe"
import { guessLook } from "./slotMaterials"

const SHA = "a".repeat(64)
const asset: PreparedAsset = {
  name: "Test",
  id: SHA as PreparedAsset["id"],
  glb: new Uint8Array(100),
  offsetMm: [1.27, 4.5, 0],
  triangleCount: 10,
  bboxMm: { min: [-2, -7, -3], max: [2, 7, 3] },
  watertight: false,
  faceCount: 4,
  slots: ["#B2190D", "#D2D1C7"],
  slotsFolded: false,
}
const footprint = readFootprint(`(footprint "Test_2pin"
  (pad "1" thru_hole rect (at 0 0) (drill 0.9)) (pad "2" thru_hole circle (at 2.54 0) (drill 0.9))
  (pad "" np_thru_hole circle (at 1 -3) (drill 3)) (pad "A-1" smd rect (at 0 2)))`)
const recipe = ComponentRecipeSchema.parse({
  id: "official/test-led",
  version: "1.0.0",
  name: "Test LED",
  summary: "A test.",
  category: ["electronics", "leds"],
  tags: ["led"],
  footprint: "Test.pretty/Test_2pin.kicad_mod",
  pins: { "1": "Cathode (K)", "2": "Anode (A)" },
  pinsSource: { kind: "datasheet", note: "symbol", confidence: "high" },
  schematic: { block: "electrical.led@1" },
})
const licenseText = { path: `licenses/${SHA}.txt`, sha256: SHA }
const grants = kicadGrants({
  tag: "10.0.7",
  modelPath: "Test.3dshapes/Test,1.step",
  footprintPath: recipe.footprint,
  licenseText,
})

const manifest = () =>
  kicadManifest({
    recipe,
    footprint,
    modelPath: "Test.3dshapes/Test,1.step",
    modelOffsetMm: [0, 0, 0],
    asset,
    colours: ["#B2190D", "#D2D1C7"],
    geometryGrant: grants.geometry,
    dataGrant: grants.data,
    thumbnail: {
      path: "components/official/test-led/1.0.0/thumbnail.png",
      sha256: SHA,
      widthPx: 256,
      heightPx: 256,
    },
    builtAt: "2026-11-25T12:00:00Z",
    app: ">=0.1.0 <1.0.0",
  })

describe("KiCad component manifests (PLAN 14.7)", () => {
  it("puts a port anchor on every numbered pad, part-local, facing into the board", () => {
    const m = manifest()
    expect(Object.keys(m.anchors)).toEqual(["mount", "pad1", "pad2", "padA_1"])
    expect(m.anchors.pad2?.frame.originMm).toEqual([2.54 - 1.27, -4.5, 0])
    expect(m.anchors.padA_1?.frame.originMm).toEqual([-1.27, -4.5, 2])
    expect(m.anchors.pad1?.name).toBe("Pad 1: Cathode (K)")
    expect(m.anchors.pad1?.frame.z).toEqual([0, -1, 0])
    expect(m.parts.body?.transform.positionMm).toEqual([1.27, 4.5, 0])
    expect(m.placement.placementAnchor).toBe("mount")
    expect(m.schematic?.block).toBe("electrical.led@1")
  })

  it("gives each colour a material: plastic bodies, metal leads, the rest as slot overrides", () => {
    const m = manifest()
    expect(m.parts.body?.material).toBe("m0")
    expect(m.parts.body?.materialSlots).toEqual([{ slot: "#D2D1C7", material: "m1" }])
    expect([guessLook("#B2190D"), guessLook("#D2D1C7"), guessLook("#1A1A1A")]).toEqual([
      "plastic",
      "metal",
      "plastic",
    ])
  })

  it("carries KiCad's licence with the pinned source of geometry and data", () => {
    const g = manifest().license.geometry
    expect(g.spdx).toBe("CC-BY-SA-4.0 WITH KiCad-libraries-exception")
    expect(g.sourceUrl).toBe(
      "https://gitlab.com/kicad/libraries/kicad-packages3D/-/blob/10.0.7/Test.3dshapes/Test%2C1.step"
    )
    expect(blobUrl("footprints", "10.0.7", "A.pretty/B.kicad_mod")).toContain(
      "kicad-footprints/-/blob/10.0.7/"
    )
    expect(() => checkAllowed("GPL-3.0-only")).toThrow("allowlist")
    expect(
      stepHeader(
        new TextEncoder().encode("ISO-10303-21;\r\nHEADER;\r\nFILE_NAME('x');\r\nENDSEC;\r\nDATA;")
      )
    ).toBe("HEADER;\nFILE_NAME('x');\nENDSEC;")
  })

  it("keys pads as the schema takes them, and refuses recipes without sources", () => {
    expect([padKey("1"), padKey("A12"), padKey("MP")]).toEqual(["pad1", "padA12", "padMP"])
    const bad = {
      ...recipe,
      schematic: { block: "electrical.resistor@1", params: { resistance: 220 } },
    }
    expect(ComponentRecipeSchema.safeParse(bad).success).toBe(false)
    expect(ComponentRecipeSchema.safeParse({ ...recipe, id: "acme/x" }).success).toBe(false)
  })
})
