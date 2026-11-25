import { createRequire } from "node:module"
import type { Occt } from "occt-import-js"
import { prepareAsset, type PreparedAsset } from "@/core/geometry/prepareAsset"
import { linearToSrgbHex } from "@/core/materials/physicalParams"
import { STEP_QUALITY } from "@/core/import/importOptions"
import { mergeMeshes } from "@/features/import/parsers/mergeMeshes"
import { meshesOf } from "@/features/import/parsers/occtParser"

let occt: Promise<Occt> | undefined

/** occt-import-js in Node: the same WASM the import worker runs, loaded once. */
function loadOcct(): Promise<Occt> {
  if (!occt) {
    const require = createRequire(import.meta.url)
    const init = require("occt-import-js") as () => Promise<Occt>
    occt = init()
  }
  return occt
}

/**
 * A KiCad STEP model as one stored asset, exactly as File › Import makes it with "normal"
 * quality and one part per file: millimetres, Z-up turned Y-up, recentred (the offset is where
 * the footprint origin sees it), B-rep faces kept, a material slot per colour.
 */
export async function stepAsset(
  bytes: Uint8Array,
  name: string
): Promise<{ asset: PreparedAsset; colours: string[] }> {
  const o = await loadOcct()
  const result = o.ReadStepFile(bytes, {
    linearUnit: "millimeter",
    linearDeflectionType: "bounding_box_ratio",
    ...STEP_QUALITY.normal,
  })
  if (!result.success) throw new Error(`${name}: occt could not read the STEP file`)
  const meshes = meshesOf(result, name)
  if (meshes.length === 0) throw new Error(`${name}: no geometry`)
  const one = meshes.length === 1 && meshes[0] ? meshes[0] : mergeMeshes(meshes, name)
  const asset = await prepareAsset(one, { mmPerUnit: 1, upAxis: "z" })
  if (!asset) throw new Error(`${name}: no triangles`)
  if (asset.slotsFolded) throw new Error(`${name}: more colours than material slots`)
  // Slot i's sRGB colour: unnamed STEP slots are named after it; a one-colour model has none.
  const single = one.color ?? one.slots?.[0]?.color
  const colours =
    asset.slots.length > 0
      ? asset.slots
      : [single ? linearToSrgbHex(single).toUpperCase() : "#808080"]
  if (!colours.every((c) => /^#[0-9A-F]{6}$/.test(c))) throw new Error(`${name}: named slots`)
  return { asset, colours }
}
