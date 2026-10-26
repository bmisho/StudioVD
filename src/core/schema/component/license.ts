import { z } from "zod"
import { Sha256Schema } from "../ids"
import { SpdxSchema } from "../primitives"
import {
  ComponentIdSchema,
  GeneratorIdSchema,
  GeneratorParamsSchema,
  HttpsUrlSchema,
  IsoUtcSchema,
  LicenseTextRefSchema,
  PackPathSchema,
  SemVerSchema,
  plainText,
} from "./text"

/** The fields of a licence grant (CLAUDE.md §12), shared by manifests and scene assets. */
const grantFields = {
  /** SPDX expression; `LicenseRef-…` for user or private content. */
  spdx: SpdxSchema.regex(/^[A-Za-z0-9.+:() -]+$/, "must be an SPDX expression"),
  creators: z
    .array(z.object({ name: plainText(120), url: HttpsUrlSchema.optional() }).strict())
    .max(32),
  copyright: plainText(500).optional(),
  /** The licensed material, at a pinned revision (CC BY 4.0 §3(a)(1)(A)(v)). */
  sourceUrl: HttpsUrlSchema.optional(),
  sourceRevision: plainText(120).optional(),
  /** What was changed, e.g. "STEP tessellated to GLB, recentred, Y-up" (§3(a)(1)(B)). */
  modifications: plainText(1000).optional(),
  licenseUrl: HttpsUrlSchema.optional(),
  attributionRequired: z.boolean(),
  /** False: a user's model whose terms forbid passing it on (Export pack refuses it). */
  redistributable: z.boolean(),
}

/** A licence in a manifest; its full text, when the licence needs a copy, is a pack file. */
export const LicenseGrantSchema = z
  .object({ ...grantFields, licenseText: LicenseTextRefSchema.optional() })
  .strict()
export type LicenseGrant = z.infer<typeof LicenseGrantSchema>

/** A scene asset's licence (Phase 9): the text is one of the project's `licenseTexts`. */
export const AssetLicenseSchema = z
  .object({ ...grantFields, licenseText: Sha256Schema.optional() })
  .strict()
export type AssetLicense = z.infer<typeof AssetLicenseSchema>

export const ComponentLicenseSchema = z
  .object({
    /** GLBs and textures. */
    geometry: LicenseGrantSchema,
    /** Anchors, parameters and text (the catalog's curation). */
    data: LicenseGrantSchema,
    /** Defaults to the geometry's. */
    thumbnail: LicenseGrantSchema.optional(),
    /** Library components this one was built from (Save as component keeps them). */
    inherited: z
      .array(
        z
          .object({ component: ComponentIdSchema, version: SemVerSchema, geometry: SpdxSchema })
          .strict()
      )
      .max(256)
      .optional(),
  })
  .strict()
export type ComponentLicense = z.infer<typeof ComponentLicenseSchema>

export const ThumbnailSchema = z
  .object({
    path: PackPathSchema.refine((p) => p.endsWith(".png"), "thumbnails are PNG"),
    sha256: Sha256Schema,
    widthPx: z.number().int().min(1).max(512),
    heightPx: z.number().int().min(1).max(512),
  })
  .strict()

/** How the manifest was made: a pack pipeline, an in-app generator, or Save as component. */
export const AuthoringSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("pipeline"),
      tool: plainText(80),
      toolVersion: plainText(32),
      builtAt: IsoUtcSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("generator"),
      generator: GeneratorIdSchema,
      generatorVersion: SemVerSchema,
      params: GeneratorParamsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("user"),
      appVersion: plainText(32),
      createdAt: IsoUtcSchema,
      author: plainText(120).optional(),
    })
    .strict(),
])
