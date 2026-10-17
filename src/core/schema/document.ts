import { z } from "zod"
import { AnchorSchema, CouplingSchema, MateSchema } from "./assembly"
import {
  AnchorIdSchema,
  AssetIdSchema,
  BindingIdSchema,
  BlockDefIdSchema,
  ComponentInstanceIdSchema,
  CouplingIdSchema,
  EdgeIdSchema,
  GroupIdSchema,
  MateIdSchema,
  MaterialIdSchema,
  NodeIdSchema,
  PartIdSchema,
  ComponentDefKeySchema,
  Sha256Schema,
  TextureIdSchema,
} from "./ids"
import { emptyUntil } from "./gates"
import { ComponentDefSnapshotSchema, ComponentInstanceSchema, LicenseTextSchema } from "./library"
import { NameSchema, Vec3Schema } from "./primitives"
import {
  BindingSchema,
  BlockDefSchema,
  SchematicEdgeSchema,
  SchematicNodeSchema,
} from "./schematic"
import {
  GeometryAssetSchema,
  GroupSchema,
  MaterialSchema,
  PartSchema,
  TextureSchema,
} from "./scene"
import { safeSegment } from "./shown"

export const SCHEMA_VERSION = 1

/**
 * `scene.json` v1 (final since Phase 5: changing what a saved file means needs a migration,
 * `migrate.ts`). Every entity collection is normalized as Record<Id, Entity> (CLAUDE.md §4).
 * Collections a later phase owns are gated empty until then (`emptyUntil`). Cross-entity
 * rules (keys, references, cycles, caps) live in `integrity.ts`.
 */
export const SceneDocumentSchema = z
  .object({
    format: z.literal("studiovd"),
    schemaVersion: z.literal(SCHEMA_VERSION),
    appVersion: z.string().max(32),
    units: z.object({ length: z.literal("mm") }).strict(),
    project: z.object({ name: NameSchema }).strict(),
    assets: z.record(AssetIdSchema, GeometryAssetSchema),
    textures: emptyUntil(z.record(TextureIdSchema, TextureSchema), 6, "Textures"),
    materials: emptyUntil(z.record(MaterialIdSchema, MaterialSchema), 6, "Materials"),
    groups: z.record(GroupIdSchema, GroupSchema),
    parts: z.record(PartIdSchema, PartSchema),
    anchors: z.record(AnchorIdSchema, AnchorSchema),
    mates: z.record(MateIdSchema, MateSchema),
    couplings: emptyUntil(z.record(CouplingIdSchema, CouplingSchema), 10, "Couplings"),
    schematic: z
      .object({
        nodes: emptyUntil(z.record(NodeIdSchema, SchematicNodeSchema), 11, "Schematic blocks"),
        edges: emptyUntil(z.record(EdgeIdSchema, SchematicEdgeSchema), 11, "Schematic wires"),
        blockDefs: emptyUntil(z.record(BlockDefIdSchema, BlockDefSchema), 11, "Block types"),
      })
      .strict(),
    bindings: emptyUntil(z.record(BindingIdSchema, BindingSchema), 13, "Bindings"),
    componentDefs: emptyUntil(
      z.record(ComponentDefKeySchema, ComponentDefSnapshotSchema),
      9,
      "Library components"
    ),
    components: emptyUntil(
      z.record(ComponentInstanceIdSchema, ComponentInstanceSchema),
      9,
      "Library components"
    ),
    licenseTexts: emptyUntil(z.record(Sha256Schema, LicenseTextSchema), 9, "Licence texts"),
    simulation: z
      .object({
        /** m/s², world frame (Y-up). Used by the solver only; Rapier gravity is always zero. */
        gravity: Vec3Schema,
        maxIterations: z.number().int().min(1).max(10_000),
        tolerance: z.number().positive(),
      })
      .strict(),
  })
  .strict()

export type SceneDocument = z.infer<typeof SceneDocumentSchema>

/** A fresh, valid, empty document. */
export function createEmptyDocument(appVersion: string, name = "Untitled"): SceneDocument {
  return {
    format: "studiovd",
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    units: { length: "mm" },
    project: { name },
    assets: {},
    textures: {},
    materials: {},
    groups: {},
    parts: {},
    anchors: {},
    mates: {},
    couplings: {},
    schematic: { nodes: {}, edges: {}, blockDefs: {} },
    bindings: {},
    componentDefs: {},
    components: {},
    licenseTexts: {},
    simulation: { gravity: [0, -9.81, 0], maxIterations: 100, tolerance: 1e-9 },
  }
}

export type ParseResult =
  { ok: true; document: SceneDocument } | { ok: false; issues: { path: string; message: string }[] }

/** Validates untrusted input (a project file is untrusted, CLAUDE.md §9). Never throws. */
export function parseDocument(input: unknown): ParseResult {
  const result = SceneDocumentSchema.safeParse(input)
  if (result.success) return { ok: true, document: result.data }
  return {
    ok: false,
    issues: result.error.issues.map((i) => ({
      path: i.path.map(safeSegment).join("."),
      message: i.message,
    })),
  }
}
