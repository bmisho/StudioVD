import type { PreparedAsset } from "@/core/geometry/prepareAsset"
import { add, sub } from "@/core/math/vec3"
import {
  ComponentManifestSchema,
  type ComponentAnchor,
  type ComponentManifest,
  type LicenseGrant,
} from "@/core/schema"
import { boardPoint, type Footprint } from "./footprint"
import type { ComponentRecipe } from "./recipe"
import { slotMaterials } from "./slotMaterials"

export const TOOL = { tool: "studiovd-pack-builder", toolVersion: "1.0.0" } as const

/** What the builder knows besides the recipe: the model, its licence, the thumbnail. */
export interface ManifestInputs {
  recipe: ComponentRecipe
  footprint: Footprint
  /** The model's path in KiCad's 3D library, e.g. `LED_THT.3dshapes/LED_D5.0mm.step`. */
  modelPath: string
  /** Where the footprint puts the model (scene mm), added to the asset's own centring offset. */
  modelOffsetMm: [number, number, number]
  asset: PreparedAsset
  colours: string[]
  geometryGrant: LicenseGrant
  dataGrant: LicenseGrant
  thumbnail: { path: string; sha256: string; widthPx: number; heightPx: number }
  builtAt: string
  /** The app versions the format it writes works with. */
  app: string
}

const DOWN = [0, -1, 0] as const
const ACROSS = [1, 0, 0] as const

/** `1` → `pad1`, `A12` → `padA12`, `MP` → `padMP` (local keys: letters, digits, `_`). */
export const padKey = (n: string): string => `pad${n.replace(/[^A-Za-z0-9]/g, "_")}`.slice(0, 32)

/**
 * Anchors on the board plane (the model's z = 0 is the board's top face): `mount` at the
 * footprint origin facing down onto a board, and a port anchor per numbered pad, facing down
 * where its lead goes in. Origins are part-local: the asset is centred on `offset`.
 */
function anchors(fp: Footprint, recipe: ComponentRecipe, offset: [number, number, number]) {
  const out: Record<string, ComponentAnchor> = {
    mount: {
      part: "body",
      name: "Board face",
      kind: "planar",
      frame: { originMm: sub(boardPoint(0, 0), offset), z: [...DOWN], x: [...ACROSS] },
      role: "mount",
    },
  }
  for (const pad of fp.pads) {
    if (pad.number === "" || pad.kind === "np_thru_hole") continue
    let key = padKey(pad.number)
    for (let n = 2; Object.hasOwn(out, key); n++) key = `${padKey(pad.number).slice(0, 28)}_${n}`
    const pin =
      recipe.pins && Object.hasOwn(recipe.pins, pad.number) ? recipe.pins[pad.number] : undefined
    out[key] = {
      part: "body",
      name: pin ? `Pad ${pad.number}: ${pin}` : `Pad ${pad.number}`,
      kind: "point",
      frame: { originMm: sub(boardPoint(pad.x, pad.y), offset), z: [...DOWN], x: [...ACROSS] },
      role: "port",
    }
  }
  return out
}

/** The user-facing description: where it came from and where each number came from. */
function description(r: ComponentRecipe, fp: Footprint, model: string): string {
  const lines = [`KiCad footprint ${fp.name}, 3D model ${model}.`]
  for (const d of r.data) {
    const src = [d.source.note, d.source.ref].filter(Boolean).join(", ")
    lines.push(
      `${d.what}: ${d.value} (${d.source.kind}${src ? `: ${src}` : ""}; ${d.source.confidence} confidence)`
    )
  }
  return lines.join("\n").slice(0, 4000)
}

/** The component.json of one KiCad part (PLAN 14.7), checked by the app's own schema. */
export function kicadManifest(i: ManifestInputs): ComponentManifest {
  const { recipe: r, asset } = i
  const position = add(asset.offsetMm, i.modelOffsetMm)
  const look = slotMaterials(asset.slots.length > 0 ? asset.slots : ["Default"], i.colours, r.slots)
  const manifest: ComponentManifest = {
    format: "studiovd-component",
    schemaVersion: 1,
    identity: {
      id: r.id,
      version: r.version,
      name: r.name,
      summary: r.summary,
      description: description(r, i.footprint, i.modelPath),
      category: r.category,
      tags: r.tags,
      ...(r.family && { family: r.family }),
      ...(r.designatorPrefix && { designatorPrefix: r.designatorPrefix }),
      ...(r.vendor && { vendor: r.vendor }),
      ...(r.mpn && { mpn: r.mpn }),
      ...(r.datasheetUrl && { datasheetUrl: r.datasheetUrl }),
      requires: { app: i.app },
    },
    parts: {
      body: {
        name: r.name,
        geometry: {
          kind: "asset",
          sha256: asset.id,
          path: `geometry/${asset.id}.glb`,
          bytes: asset.glb.length,
          triangles: asset.triangleCount,
          bboxMm: { min: [...asset.bboxMm.min], max: [...asset.bboxMm.max] },
        },
        transform: { positionMm: position, quaternion: [0, 0, 0, 1] },
        material: look.material,
        ...(look.materialSlots && { materialSlots: look.materialSlots }),
        collider: "hull",
        role: "body",
      },
    },
    rootPart: "body",
    materials: look.materials,
    anchors: anchors(i.footprint, r, position),
    mates: {},
    suggestedMates: [{ anchor: "mount", mateType: "fixed", flip: true, label: "On a board" }],
    placement: { placementAnchor: "mount", groundIfFirst: false },
    thumbnails: [i.thumbnail],
    license: { geometry: i.geometryGrant, data: i.dataGrant },
    authoring: { kind: "pipeline", ...TOOL, builtAt: i.builtAt },
    ...(r.schematic && { schematic: r.schematic }),
  }
  // Through JSON once, as the pack stores it (no -0), then the app's strict schema.
  return ComponentManifestSchema.parse(JSON.parse(JSON.stringify(manifest)))
}
