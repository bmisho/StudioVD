import { z } from "zod"
import {
  AnchorIdSchema,
  BindingIdSchema,
  ComponentDefKeySchema,
  ComponentInstanceIdSchema,
  GroupIdSchema,
  MateIdSchema,
  MaterialIdSchema,
  NodeIdSchema,
  PartIdSchema,
} from "./ids"
import { ComponentManifestSchema } from "./component/manifest"
import { ComponentIdSchema, SemVerSchema } from "./component/text"
import { LocalKeySchema, SpdxSchema } from "./primitives"

// Library records inside a project (PLAN.md §1.3, §4.6): gated empty until Phase 9, now the
// strict component.json schema holds them. An opened .stvd is untrusted (CLAUDE.md §9).

/** Where a component definition came from (provenance; nothing here is trusted). */
export const ComponentOriginSchema = z.enum([
  "official",
  "user",
  "sideloaded",
  "generator",
  "project",
])

/**
 * A frozen copy of a component's manifest, stored once per definition: a project never needs
 * the library to open, duplicate or credit what it holds. Keyed `<id>@<version>#<sha12>`.
 */
export const ComponentDefSnapshotSchema = z
  .object({
    key: ComponentDefKeySchema,
    id: ComponentIdSchema,
    version: SemVerSchema,
    /** SHA-256 of the component.json bytes it was read from. */
    manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
    origin: ComponentOriginSchema,
    manifest: ComponentManifestSchema,
  })
  .strict()
  .superRefine((d, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message })
    if (d.manifest.identity.id !== d.id) issue("id", "is not the manifest's")
    if (d.manifest.identity.version !== d.version) issue("version", "is not the manifest's")
    if (d.key !== componentDefKey(d.id, d.version, d.manifestSha256))
      issue("key", "must be <id>@<version>#<first 12 of manifestSha256>")
  })
export type ComponentDefSnapshot = z.infer<typeof ComponentDefSnapshotSchema>

/** The natural key of a component definition. */
export const componentDefKey = (id: string, version: string, manifestSha256: string) =>
  `${id}@${version}#${manifestSha256.slice(0, 12)}`

/** Which project entities an inserted component created, keyed by the manifest's local keys. */
export const ComponentInstanceSchema = z
  .object({
    id: ComponentInstanceIdSchema,
    def: ComponentDefKeySchema.nullable(),
    designator: z.string().regex(/^[A-Z]{1,4}[0-9]{1,5}$/),
    groupId: GroupIdSchema,
    parts: z.record(LocalKeySchema, PartIdSchema),
    anchors: z.record(LocalKeySchema, AnchorIdSchema),
    mates: z.record(LocalKeySchema, MateIdSchema),
    materials: z.record(LocalKeySchema, MaterialIdSchema),
    bindings: z.record(LocalKeySchema, BindingIdSchema),
    nodeId: NodeIdSchema.optional(),
    unlinked: z.boolean().optional(),
  })
  .strict()
export type ComponentInstance = z.infer<typeof ComponentInstanceSchema>

/** A licence text file, by the SHA-256 of its bytes (the record key). */
export const LicenseTextSchema = z
  .object({
    path: z.string().regex(/^licenses\/[0-9a-f]{64}\.txt$/),
    spdx: SpdxSchema,
  })
  .strict()
