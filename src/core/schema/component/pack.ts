import { z } from "zod"
import { Sha256Schema } from "../ids"
import { MAX_COMPONENT_GLB_BYTES } from "./parts"
import { ComponentIdSchema, IsoUtcSchema, PackPathSchema, SemVerSchema, plainText } from "./text"

const MIB = 1024 * 1024

/**
 * The files a pack may hold (PLAN 4.4: JSON, GLB, PNG, JPG, TXT only), each kind with its own
 * size cap; content-addressed files are named by their SHA-256. The Rust guard enforces the
 * same list on the zip before anything is extracted.
 */
export const PACK_FILE_KINDS = [
  {
    kind: "manifest",
    pattern: /^components\/[^/]+\/[^/]+\/[^/]+\/component\.json$/,
    maxBytes: 4 * MIB,
  },
  {
    kind: "thumbnail",
    pattern: /^components\/[^/]+\/[^/]+\/[^/]+\/[a-z0-9-]{1,32}\.png$/,
    maxBytes: MIB,
  },
  {
    kind: "geometry",
    pattern: /^geometry\/([0-9a-f]{64})\.glb$/,
    maxBytes: MAX_COMPONENT_GLB_BYTES,
  },
  { kind: "texture", pattern: /^textures\/([0-9a-f]{64})\.(png|jpg)$/, maxBytes: 16 * MIB },
  { kind: "license", pattern: /^licenses\/([0-9a-f]{64})\.txt$/, maxBytes: MIB },
] as const

/** What kind of pack file a path names, or null for a path no pack may hold. */
export function packFileKind(path: string) {
  return PACK_FILE_KINDS.find((k) => k.pattern.test(path)) ?? null
}

const PackFileSchema = z
  .object({ path: PackPathSchema, sha256: Sha256Schema, bytes: z.number().int().nonnegative() })
  .strict()
  .superRefine((f, ctx) => {
    const kind = packFileKind(f.path)
    const issue = (message: string) => ctx.addIssue({ code: "custom", path: ["path"], message })
    if (!kind) return issue("is not a file a pack may hold")
    if (f.bytes > kind.maxBytes) issue(`is larger than ${kind.maxBytes} bytes`)
    const named = kind.pattern.exec(f.path)?.[1]
    if (named !== undefined && named !== f.sha256) issue("is not named by its SHA-256")
  })

/** `pack.json` at the root of a `.stvdpack` (PLAN 4.4): every other file, with its hash. */
export const PackManifestSchema = z
  .object({
    format: z.literal("studiovd-pack"),
    schemaVersion: z.literal(1),
    createdBy: plainText(80),
    createdAt: IsoUtcSchema,
    components: z
      .array(
        z
          .object({
            id: ComponentIdSchema,
            version: SemVerSchema,
            manifestPath: PackPathSchema,
            manifestSha256: Sha256Schema,
          })
          .strict()
      )
      .min(1)
      .max(1000),
    /** Unlisted zip entries reject the pack; so do listed files the zip lacks. */
    files: z.array(PackFileSchema).min(1).max(20_000),
  })
  .strict()
  .superRefine((p, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message })
    const byPath = new Map<string, string>()
    p.files.forEach((f, i) => {
      const lower = f.path.toLowerCase() // Windows: names differing only by case are one file
      if (byPath.has(lower)) issue(["files", i, "path"], "is listed twice")
      byPath.set(lower, f.sha256)
    })
    const seen = new Set<string>()
    p.components.forEach((c, i) => {
      const at = `${c.id}@${c.version}`
      if (seen.has(at)) issue(["components", i], "is listed twice")
      seen.add(at)
      if (c.manifestPath !== `components/${c.id}/${c.version}/component.json`)
        issue(["components", i, "manifestPath"], "must be components/<id>/<version>/component.json")
      if (byPath.get(c.manifestPath.toLowerCase()) !== c.manifestSha256)
        issue(["components", i, "manifestSha256"], "is not the listed file's hash")
    })
  })
export type PackManifest = z.infer<typeof PackManifestSchema>
