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
import { LocalKeySchema, SpdxSchema } from "./primitives"

// Library records inside a project (PLAN.md §1.3, §4.6). Present from schema v1 but gated
// empty until Phase 9 (document.ts): an opened .stvd is untrusted (CLAUDE.md §9), so no
// manifest gets in before its strict schema exists.

/** Validated copy of a library component manifest, stored once per definition. */
export const ComponentDefSnapshotSchema = z
  .object({
    key: ComponentDefKeySchema,
    id: z.string().max(97),
    version: z.string().max(64),
    manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
    origin: z.enum(["official", "user", "sideloaded", "project"]),
    /** Placeholder: Phase 9 replaces this with the strict component.json schema. */
    manifest: z.unknown(),
  })
  .strict()
export type ComponentDefSnapshot = z.infer<typeof ComponentDefSnapshotSchema>

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
