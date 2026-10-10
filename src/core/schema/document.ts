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
  TextureIdSchema,
} from "./ids"
import { ComponentDefsSchema, ComponentInstanceSchema, LicenseTextSchema } from "./library"
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

export const SCHEMA_VERSION = 1

/**
 * `scene.json` v1 (draft until Phase 5 finalizes it; after that, changes need a migration).
 * Every entity collection is normalized as Record<Id, Entity> (CLAUDE.md §4).
 */
export const SceneDocumentSchema = z
  .object({
    format: z.literal("studiovd"),
    schemaVersion: z.literal(SCHEMA_VERSION),
    appVersion: z.string().max(32),
    units: z.object({ length: z.literal("mm") }).strict(),
    project: z.object({ name: NameSchema }).strict(),
    assets: z.record(AssetIdSchema, GeometryAssetSchema),
    textures: z.record(TextureIdSchema, TextureSchema),
    materials: z.record(MaterialIdSchema, MaterialSchema),
    groups: z.record(GroupIdSchema, GroupSchema),
    parts: z.record(PartIdSchema, PartSchema),
    anchors: z.record(AnchorIdSchema, AnchorSchema),
    mates: z.record(MateIdSchema, MateSchema),
    couplings: z.record(CouplingIdSchema, CouplingSchema),
    schematic: z
      .object({
        nodes: z.record(NodeIdSchema, SchematicNodeSchema),
        edges: z.record(EdgeIdSchema, SchematicEdgeSchema),
        blockDefs: z.record(BlockDefIdSchema, BlockDefSchema),
      })
      .strict(),
    bindings: z.record(BindingIdSchema, BindingSchema),
    componentDefs: ComponentDefsSchema,
    components: z.record(ComponentInstanceIdSchema, ComponentInstanceSchema),
    licenseTexts: z.record(z.string().regex(/^[0-9a-f]{64}$/), LicenseTextSchema),
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
    issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  }
}
