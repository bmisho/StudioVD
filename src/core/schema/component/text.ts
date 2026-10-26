import { z } from "zod"
import { Sha256Schema } from "../ids"
import { LocalKeySchema } from "../primitives"
import { isVersionRange, SEMVER_PATTERN } from "./semver"

// Shared field rules of component manifests, packs and the catalog (PLAN 4.3-4.7). Values
// are refused, never transformed: a manifest is stored as read, next to its file's SHA-256.

const hasControl = (s: string, multiline: boolean) =>
  [...s].some((c) => (c < " " && !(multiline && c === "\n")) || c === "\u007f")

/** Text shown as plain text only (never HTML): no control characters, no outer spaces. */
export const plainText = (max: number, multiline = false) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => !hasControl(s, multiline), "no control characters")
    .refine((s) => s === s.trim(), "no leading or trailing spaces")

/** `<namespace>/<slug>`, e.g. `official/led-5mm-red`. */
export const ComponentIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,31}\/[a-z0-9][a-z0-9._-]{0,63}$/, "must be <namespace>/<slug>")
  .brand<"ComponentId">()
export type ComponentId = z.infer<typeof ComponentIdSchema>

/** Namespaces only signed catalogs and the app itself may use (PLAN 4.7). */
export const RESERVED_NAMESPACES: ReadonlySet<string> = new Set([
  "official",
  "gen",
  "builtin",
  "studiovd",
])
export const namespaceOf = (id: string): string => id.split("/")[0] ?? ""

export const SemVerSchema = z.string().max(64).regex(SEMVER_PATTERN, "must be x.y.z (SemVer)")
export const SemVerRangeSchema = z.string().refine(isVersionRange, "must be a version range")

/** https only, no user info or spaces; opened only by the app's link wrapper, on request. */
export const HttpsUrlSchema = z
  .string()
  .max(2048)
  .regex(/^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?(\/[^\s"<>\\^`{|}]*)?$/, "must be an https URL")

/** RFC 3339 UTC timestamp, second or millisecond precision. */
export const IsoUtcSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/, "must be an ISO UTC time")

export const SlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
export const TagSchema = z.string().regex(/^[a-z0-9][a-z0-9 ._+-]{0,31}$/)

/** An in-app parametric generator, e.g. `bearing.deepGroove` (code never comes in packs). */
export const GeneratorIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*){1,3}$/)
export const MajorVersionSchema = z.number().int().min(1).max(999)

/**
 * A pack-relative POSIX path: no `..`, no leading or trailing `/`, no empty or dot-led
 * segments, no backslashes, at most 200 characters.
 */
export const PackPathSchema = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/, "must be a pack path")

/** A licence text in a pack or bundle: `licenses/<sha256>.txt`. */
export const LicenseTextRefSchema = z
  .object({ path: z.string(), sha256: Sha256Schema })
  .strict()
  .refine((r) => r.path === `licenses/${r.sha256}.txt`, "must be licenses/<sha256>.txt")

/** Where a number came from (CLAUDE.md §12): every datasheet value carries one. */
export const ValueSourceSchema = z
  .object({
    kind: z.enum(["datasheet", "standard", "measured", "computed", "estimated", "user"]),
    ref: HttpsUrlSchema.optional(),
    note: plainText(280).optional(),
    confidence: z.enum(["high", "medium", "low"]),
  })
  .strict()
export type ValueSource = z.infer<typeof ValueSourceSchema>

/** Records keyed by author-chosen keys stay small: at most `max` entries. */
export const atMost =
  (max: number) =>
  (record: object): boolean =>
    Object.keys(record).length <= max

/** Generator parameters: plain values only, checked again by the generator's own schema. */
export const GeneratorParamsSchema = z
  .record(LocalKeySchema, z.union([z.number(), z.string().max(64), z.boolean()]))
  .refine(atMost(32), "at most 32 parameters")
export type GeneratorParams = z.infer<typeof GeneratorParamsSchema>
