import { z } from "zod"
import {
  ComponentIdSchema,
  GeneratorIdSchema,
  HttpsUrlSchema,
  MajorVersionSchema,
  SemVerRangeSchema,
  SemVerSchema,
  SlugSchema,
  TagSchema,
  atMost,
  plainText,
} from "./text"

/** What a component is and needs (PLAN 4.3 identity). */
export const ComponentIdentitySchema = z
  .object({
    id: ComponentIdSchema,
    /** MAJOR changes when a local key goes or is renamed (mates and wires would break). */
    version: SemVerSchema,
    name: plainText(80),
    summary: plainText(280).optional(),
    description: plainText(4000, true).optional(),
    /** 1..4 slugs, broadest first: ["mechanical", "bearings"]. */
    category: z.array(SlugSchema).min(1).max(4),
    tags: z.array(TagSchema).max(32),
    /** Variants sharing geometry, e.g. `led-5mm` for red, green and blue. */
    family: SlugSchema.optional(),
    /** Designator prefix: `M` makes M1, M2... */
    designatorPrefix: z
      .string()
      .regex(/^[A-Z]{1,4}$/)
      .optional(),
    vendor: plainText(80).optional(),
    mpn: plainText(80).optional(),
    datasheetUrl: HttpsUrlSchema.optional(),
    requires: z
      .object({
        /** App versions it works with; others list it as "Needs newer StudioVD". */
        app: SemVerRangeSchema,
        /** In-app generators it uses, by MAJOR version. */
        generators: z
          .record(GeneratorIdSchema, MajorVersionSchema)
          .refine(atMost(16), "at most 16 generators")
          .optional(),
      })
      .strict(),
    deprecated: z
      .object({ reason: plainText(280), replacedBy: ComponentIdSchema.optional() })
      .strict()
      .optional(),
  })
  .strict()
export type ComponentIdentity = z.infer<typeof ComponentIdentitySchema>
