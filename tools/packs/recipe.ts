import { z } from "zod"
import {
  ComponentIdSchema,
  ComponentSchematicSchema,
  HttpsUrlSchema,
  SemVerSchema,
  SlugSchema,
  TagSchema,
  ValueSourceSchema,
  plainText,
} from "@/core/schema"

/**
 * What the catalog repository says about one component built from KiCad's libraries
 * (PLAN 14.7): which footprint and model, what to call it, its pins, its schematic block and
 * where every number in it came from. Geometry, pads and licence come from the sources.
 */
const KicadPath = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9_.,+-]+\.(pretty|3dshapes)\/[A-Za-z0-9_.,+-]+\.(kicad_mod|step)$/)

/** A number the component states (a block parameter, a rating), with its source (§12). */
const DatumSchema = z
  .object({ what: plainText(120), value: plainText(120), source: ValueSourceSchema })
  .strict()

/** A colour slot's look: `metal` or `plastic` (tinted built-ins), or a built-in key. */
const SlotLookSchema = z.union([
  z.enum(["metal", "plastic"]),
  z
    .string()
    .regex(/^std\.[a-z0-9-]+$/)
    .transform((s) => s as `std.${string}`),
])

export const ComponentRecipeSchema = z
  .object({
    id: ComponentIdSchema.refine((id) => id.startsWith("official/"), "official/ only"),
    version: SemVerSchema,
    name: plainText(80),
    summary: plainText(280),
    category: z.array(SlugSchema).min(1).max(4),
    tags: z.array(TagSchema).max(32),
    family: SlugSchema.optional(),
    designatorPrefix: z
      .string()
      .regex(/^[A-Z]{1,4}$/)
      .optional(),
    vendor: plainText(80).optional(),
    mpn: plainText(80).optional(),
    datasheetUrl: HttpsUrlSchema.optional(),
    footprint: KicadPath,
    /** Defaults to the model the footprint names. */
    model: KicadPath.optional(),
    /** Pad number → pin name (from KiCad's symbol, or the datasheet). */
    pins: z.record(z.string().max(16), plainText(60)).optional(),
    pinsSource: ValueSourceSchema.optional(),
    schematic: ComponentSchematicSchema.optional(),
    data: z.array(DatumSchema).max(32).default([]),
    slots: z.record(z.string().max(64), SlotLookSchema).default({}),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.pins && !r.pinsSource)
      ctx.addIssue({ code: "custom", path: ["pinsSource"], message: "pins need a source" })
    if (r.schematic?.params && Object.keys(r.schematic.params).length > r.data.length)
      ctx.addIssue({ code: "custom", path: ["data"], message: "every parameter needs a source" })
  })
export type ComponentRecipe = z.infer<typeof ComponentRecipeSchema>

export const PackRecipeSchema = z
  .object({
    /** The pack file's name stem and its preview pack's: `<pack>.stvdpack`. */
    pack: SlugSchema,
    label: plainText(80),
    /** The category path whose browsing loads this pack's thumbnails. */
    category: z.array(SlugSchema).min(1).max(4),
    components: z.array(ComponentRecipeSchema).min(1).max(1000),
  })
  .strict()
  .superRefine((p, ctx) => {
    const ids = p.components.map((c) => c.id)
    ids.forEach((id, i) => {
      if (ids.indexOf(id) !== i)
        ctx.addIssue({ code: "custom", path: ["components", i, "id"], message: "listed twice" })
    })
  })
export type PackRecipe = z.infer<typeof PackRecipeSchema>
