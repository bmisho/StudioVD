import { z } from "zod"
import { Sha256Schema } from "../ids"
import { SpdxSchema } from "../primitives"
import { DomainSchema } from "../schematic"
import {
  ComponentIdSchema,
  GeneratorIdSchema,
  GeneratorParamsSchema,
  HttpsUrlSchema,
  IsoUtcSchema,
  MajorVersionSchema,
  PackPathSchema,
  SemVerRangeSchema,
  SemVerSchema,
  SlugSchema,
  TagSchema,
  atMost,
  plainText,
} from "./text"

/** A path under a mirror's base URL, e.g. `v2026.10.1/leds.stvdpack`. */
const RelUrlSchema = z
  .string()
  .max(512)
  .regex(/^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/)

/** Browsing works from the index alone, before anything is downloaded (PLAN 4.4). */
export const CatalogComponentEntrySchema = z
  .object({
    id: ComponentIdSchema,
    version: SemVerSchema,
    name: plainText(80),
    summary: plainText(280),
    category: z.array(SlugSchema).min(1).max(4),
    tags: z.array(TagSchema).max(32),
    family: SlugSchema.optional(),
    vendor: plainText(80).optional(),
    mpn: plainText(80).optional(),
    domains: z.array(DomainSchema).max(6),
    partCount: z.number().int().min(1).max(64),
    triangles: z.number().int().nonnegative().max(5_000_000),
    hasSchematic: z.boolean(),
    license: z.object({ geometry: SpdxSchema, data: SpdxSchema }).strict(),
    requires: z
      .object({
        app: SemVerRangeSchema,
        generators: z
          .record(GeneratorIdSchema, MajorVersionSchema)
          .refine(atMost(16), "at most 16 generators")
          .optional(),
      })
      .strict(),
    /** SHA-256 of the exact component.json bytes in the pack: anchors the hash chain. */
    manifestSha256: Sha256Schema,
    pack: Sha256Schema,
    thumbnail: z
      .object({ pack: Sha256Schema, path: PackPathSchema, sha256: Sha256Schema })
      .strict(),
    publishedAt: IsoUtcSchema,
    deprecated: z
      .object({ reason: plainText(280), replacedBy: ComponentIdSchema.optional() })
      .strict()
      .optional(),
  })
  .strict()

export const PackEntrySchema = z
  .object({
    url: RelUrlSchema,
    /** Equals the pack id (its key). */
    sha256: Sha256Schema,
    /** The download is aborted past this many bytes; extraction past `uncompressedBytes`. */
    bytes: z
      .number()
      .int()
      .positive()
      .max(512 * 1024 * 1024),
    uncompressedBytes: z
      .number()
      .int()
      .positive()
      .max(2 * 1024 * 1024 * 1024),
    entries: z.number().int().min(1).max(20_001),
  })
  .strict()

/** In-app generator presets: no geometry download, only a tiny manifest pack. */
export const GeneratorPresetEntrySchema = z
  .object({
    id: ComponentIdSchema,
    version: SemVerSchema,
    name: plainText(80),
    category: z.array(SlugSchema).min(1).max(4),
    tags: z.array(TagSchema).max(32),
    generator: GeneratorIdSchema,
    generatorMajor: MajorVersionSchema,
    params: GeneratorParamsSchema,
    manifestSha256: Sha256Schema,
    pack: Sha256Schema,
  })
  .strict()

export const MirrorListSchema = z.array(HttpsUrlSchema).min(1).max(8)
