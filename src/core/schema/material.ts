import { z } from "zod"
import { MaterialIdSchema, TextureIdSchema } from "./ids"
import { NameSchema } from "./primitives"

/** An sRGB colour as stored: lowercase `#rrggbb` (no transform, so the text round-trips). */
export const HexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/, "must be a lowercase #rrggbb")

const unit = z.number().min(0).max(1)

/**
 * Most material slots one asset holds (PLAN 6.1). Slot names are the source's material names
 * (glTF material, OBJ `usemtl`) or `#RRGGBB` for colour-only sources (STEP, STL).
 */
export const MAX_SLOTS = 64

/**
 * A slot name, as cleaned at import: free text, so it is only ever a list item, never a record
 * key. Refused rather than trimmed (a transform would break the round trip).
 */
export const SlotNameSchema = z
  .string()
  .min(1)
  .max(120)
  .refine((s) => ![...s].some((c) => c < " " || c === "\u007f"), "no control characters")
  .refine((s) => s === s.trim(), "no leading or trailing spaces")

/**
 * A texture on a material. Assets have no UVs, so maps are projected from the three part-local
 * axes (triplanar); `tileSizeMm` is the size one image repeat covers.
 */
export const TextureMapSchema = z
  .object({
    textureId: TextureIdSchema,
    tileSizeMm: z.number().min(0.01).max(1e5),
  })
  .strict()
export type TextureMap = z.infer<typeof TextureMapSchema>

/** Map slots a material can fill. Normal maps may follow as another optional field. */
export const MaterialMapsSchema = z
  .object({
    baseColor: TextureMapSchema.optional(),
    roughness: TextureMapSchema.optional(),
  })
  .strict()
export type MaterialMaps = z.infer<typeof MaterialMapsSchema>
export type MapKind = keyof MaterialMaps

/**
 * A document material (PLAN 6.1): physically based appearance (three's MeshPhysicalMaterial,
 * glTF's metallic-roughness model and its clearcoat, transmission, IOR and volume extensions)
 * plus the density physics uses. `builtinKey` records which built-in preset it started from
 * (provenance only: every value is stored, so a key this build does not know still opens).
 * Bounds keep masses and inertias finite in float32 (densest element: osmium, 22 590 kg/m³).
 */
export const MaterialSchema = z
  .object({
    id: MaterialIdSchema,
    name: NameSchema,
    builtinKey: z
      .string()
      .regex(/^[a-z][a-z0-9]*(\.[a-z0-9][a-z0-9-]*)+$/)
      .max(64)
      .optional(),
    color: HexColorSchema,
    metalness: unit,
    roughness: unit,
    opacity: unit,
    transmission: unit,
    /** Index of refraction, three's range (glTF KHR_materials_ior). */
    ior: z.number().min(1).max(2.333),
    /** Volume thickness for transmission, in part millimetres. */
    thicknessMm: z.number().min(0).max(1e4),
    clearcoat: unit,
    clearcoatRoughness: unit,
    emissive: HexColorSchema,
    emissiveIntensity: z.number().min(0).max(100),
    densityKgM3: z.number().min(1).max(1e5),
    maps: MaterialMapsSchema.optional(),
  })
  .strict()
export type Material = z.infer<typeof MaterialSchema>

/** One slot of a part given its own material, overriding the part's material there. */
export const MaterialSlotSchema = z
  .object({ slot: SlotNameSchema, materialId: MaterialIdSchema })
  .strict()
export type MaterialSlot = z.infer<typeof MaterialSlotSchema>

const unique = (names: readonly string[]) => new Set(names).size === names.length

/** A part's slot overrides: each slot at most once. */
export const MaterialSlotsSchema = z
  .array(MaterialSlotSchema)
  .min(1)
  .max(MAX_SLOTS)
  .refine((slots) => unique(slots.map((s) => s.slot)), "each slot at most once")

/** An asset's slot names in triangle order, present only when there are two or more. */
export const AssetSlotsSchema = z
  .array(SlotNameSchema)
  .min(2)
  .max(MAX_SLOTS)
  .refine(unique, "slot names must be unique")
