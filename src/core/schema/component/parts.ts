import { z } from "zod"
import { Sha256Schema } from "../ids"
import { MaterialSchema, SlotNameSchema } from "../material"
import { LocalKeySchema, PoseSchema, Vec3MmSchema } from "../primitives"
import { BoundsMmSchema, ColliderKindSchema } from "../scene"
import {
  GeneratorIdSchema,
  GeneratorParamsSchema,
  MajorVersionSchema,
  ValueSourceSchema,
  plainText,
} from "./text"

/** Largest GLB a pack may hold for one part (bytes); the Rust guard caps the same. */
export const MAX_COMPONENT_GLB_BYTES = 64 * 1024 * 1024

/**
 * A part's geometry: a normalized GLB in the pack (mm, Y-up, centred on its box, as Phase 4
 * imports), or the output of an in-app generator (nothing executable comes in a pack).
 */
export const GeometryRefSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("asset"),
      sha256: Sha256Schema,
      path: z.string(),
      bytes: z.number().int().positive().max(MAX_COMPONENT_GLB_BYTES),
      triangles: z.number().int().nonnegative().max(5_000_000),
      bboxMm: BoundsMmSchema,
    })
    .strict()
    .refine((g) => g.path === `geometry/${g.sha256}.glb`, "path must be geometry/<sha256>.glb"),
  z
    .object({
      kind: z.literal("generated"),
      generator: GeneratorIdSchema,
      generatorMajor: MajorVersionSchema,
      params: GeneratorParamsSchema,
      /** Which body of the generator's output (a bearing has an outer and an inner ring). */
      output: LocalKeySchema,
    })
    .strict(),
])
export type GeometryRef = z.infer<typeof GeometryRefSchema>

export const ComponentPartSchema = z
  .object({
    name: plainText(80),
    geometry: GeometryRefSchema,
    /** Its pose in the component frame: rigid only, never scaled (CLAUDE.md §5). */
    transform: PoseSchema,
    /** The part's material, a key into the manifest's materials. */
    material: LocalKeySchema,
    /** Slot overrides, as on scene parts (Phase 6). */
    materialSlots: z
      .array(z.object({ slot: SlotNameSchema, material: LocalKeySchema }).strict())
      .min(1)
      .max(64)
      .refine((s) => new Set(s.map((x) => x.slot)).size === s.length, "each slot at most once")
      .optional(),
    /** A datasheet mass beats density × volume of simplified geometry. */
    mass: z
      .object({
        kg: z.number().positive().max(1e6),
        comMm: Vec3MmSchema.optional(),
        source: ValueSourceSchema,
      })
      .strict()
      .optional(),
    collider: ColliderKindSchema,
    role: z.enum(["body", "moving", "emitter", "actuator", "fastener"]).optional(),
  })
  .strict()
export type ComponentPart = z.infer<typeof ComponentPartSchema>

/** A texture image in the pack, projected like scene maps (triplanar, part-local mm). */
const TextureFileMapSchema = z
  .object({
    sha256: Sha256Schema,
    path: z.string(),
    tileSizeMm: z.number().min(0.01).max(1e5),
  })
  .strict()
  .refine(
    (m) => m.path === `textures/${m.sha256}.png` || m.path === `textures/${m.sha256}.jpg`,
    "path must be textures/<sha256>.png|jpg"
  )

/**
 * A material: a built-in preset by its stable key (`std.steel`), or written out with the
 * scene material's fields (Phase 6), its maps naming texture files in the pack.
 */
export const MaterialRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("builtin"), key: MaterialSchema.shape.builtinKey.unwrap() }).strict(),
  MaterialSchema.omit({ id: true, builtinKey: true, maps: true })
    .extend({
      kind: z.literal("inline"),
      maps: z
        .object({
          baseColor: TextureFileMapSchema.optional(),
          roughness: TextureFileMapSchema.optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
])
export type MaterialRef = z.infer<typeof MaterialRefSchema>
