import { z } from "zod"
import { Sha256Schema } from "../ids"
import {
  CatalogComponentEntrySchema,
  GeneratorPresetEntrySchema,
  MirrorListSchema,
  PackEntrySchema,
} from "./catalog"
import {
  ComponentIdSchema,
  IsoUtcSchema,
  SemVerSchema,
  SlugSchema,
  atMost,
  plainText,
} from "./text"

/**
 * The signed catalog index, `index.json` (PLAN 4.4; ≤ 16 MiB, checked in Rust before it is
 * parsed). Phase 14 fetches and verifies it; Phase 9 only defines and tests the format.
 */
export const CatalogIndexSchema = z
  .object({
    format: z.literal("studiovd-catalog"),
    schemaVersion: z.literal(1),
    /** `official` is reserved for indexes signed by a compiled-in key. */
    catalogId: SlugSchema,
    /** Strictly increasing; the client keeps the highest verified one (rollback guard). */
    sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    generatedAt: IsoUtcSchema,
    /** No installs from an expired index (freeze guard); installed content keeps working. */
    expiresAt: IsoUtcSchema,
    minAppVersion: SemVerSchema,
    /** The minisign key id (16 hex digits) that signed it. */
    signingKeyId: z.string().regex(/^[0-9A-F]{16}$/),
    mirrors: MirrorListSchema,
    categories: z
      .array(
        z
          .object({
            path: z.array(SlugSchema).min(1).max(4),
            label: plainText(80),
            order: z.number().int(),
          })
          .strict()
      )
      .max(500),
    components: z.array(CatalogComponentEntrySchema).max(50_000),
    packs: z.record(Sha256Schema, PackEntrySchema).refine(atMost(5_000), "at most 5000 packs"),
    bundles: z
      .array(
        z
          .object({
            id: SlugSchema,
            label: plainText(80),
            pack: Sha256Schema,
            components: z
              .array(z.object({ id: ComponentIdSchema, version: SemVerSchema }).strict())
              .min(1)
              .max(1000),
          })
          .strict()
      )
      .max(200),
    /** Category path joined by `/` → the pack holding its thumbnails. */
    previewPacks: z.record(z.string().max(200), Sha256Schema).refine(atMost(500)),
    generatorPresets: z.array(GeneratorPresetEntrySchema).max(5_000),
    revoked: z
      .array(
        z
          .object({
            id: ComponentIdSchema,
            version: SemVerSchema,
            reason: plainText(280),
            severity: z.enum(["yanked", "security"]),
          })
          .strict()
      )
      .max(10_000),
    /** Shown as plain text in the Library tab, never as HTML. */
    notices: z
      .array(
        z
          .object({
            id: SlugSchema,
            severity: z.enum(["info", "warning"]),
            text: plainText(500),
          })
          .strict()
      )
      .max(16),
  })
  .strict()
  .superRefine((index, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message })
    const pack = (id: string) => Object.hasOwn(index.packs, id)
    for (const [id, entry] of Object.entries(index.packs))
      if (entry.sha256 !== id) issue(["packs", id, "sha256"], "is not its key")
    const listed = new Set<string>()
    index.components.forEach((c, i) => {
      const at = `${c.id}@${c.version}`
      if (listed.has(at)) issue(["components", i], "is listed twice")
      listed.add(at)
      if (!pack(c.pack)) issue(["components", i, "pack"], "is not a listed pack")
      if (!pack(c.thumbnail.pack))
        issue(["components", i, "thumbnail", "pack"], "is not a listed pack")
    })
    index.bundles.forEach((b, i) => {
      if (!pack(b.pack)) issue(["bundles", i, "pack"], "is not a listed pack")
      b.components.forEach((c, j) => {
        if (!listed.has(`${c.id}@${c.version}`))
          issue(["bundles", i, "components", j], "is not listed")
      })
    })
    for (const [path, id] of Object.entries(index.previewPacks))
      if (!pack(id)) issue(["previewPacks", path], "is not a listed pack")
    index.generatorPresets.forEach((g, i) => {
      if (!pack(g.pack)) issue(["generatorPresets", i, "pack"], "is not a listed pack")
    })
    if (Date.parse(index.expiresAt) <= Date.parse(index.generatedAt))
      issue(["expiresAt"], "must be after generatedAt")
  })
export type CatalogIndex = z.infer<typeof CatalogIndexSchema>
