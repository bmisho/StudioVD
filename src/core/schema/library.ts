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
import { SpdxSchema } from "./primitives"

// Library records inside a project (PLAN.md §1.3, §4.6). Present from schema v1 so that
// Phase 9 needs no migration.

const LocalKeySchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/)
  .refine((k) => !["__proto__", "constructor", "prototype"].includes(k), "reserved key")

/** Validated copy of a library component manifest, stored once per definition. */
export const ComponentDefSnapshotSchema = z
  .object({
    key: ComponentDefKeySchema,
    id: z.string().max(97),
    version: z.string().max(64),
    manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
    origin: z.enum(["official", "user", "sideloaded", "project"]),
    /**
     * Phase 2 placeholder. Phase 9 replaces this with the strict component.json schema; until
     * then no code path creates snapshots, so nothing unvalidated can enter a document.
     */
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

export const LicenseTextSchema = z
  .object({
    path: z.string().regex(/^licenses\/[0-9a-f]{64}\.txt$/),
    spdx: SpdxSchema,
  })
  .strict()
