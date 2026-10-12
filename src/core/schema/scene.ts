import { z } from "zod"
import {
  AssetIdSchema,
  GroupIdSchema,
  MaterialIdSchema,
  PartIdSchema,
  TextureIdSchema,
} from "./ids"
import { NameSchema, PoseSchema, Vec3Schema } from "./primitives"

/** Part-local bounds; `min` never exceeds `max` on any axis. */
export const BoundsMmSchema = z
  .object({ min: Vec3Schema, max: Vec3Schema })
  .strict()
  .refine((b) => b.min.every((v, i) => v <= (b.max[i] ?? v)), "bbox min must not exceed max")

/**
 * A normalized mesh, stored once per content address at `geometry/<id>.glb`. Licence
 * metadata (CLAUDE.md §12) arrives with library components in Phase 9, as an optional field.
 */
export const GeometryAssetSchema = z
  .object({
    id: AssetIdSchema,
    path: z.string().regex(/^geometry\/[0-9a-f]{64}\.glb$/),
    triangleCount: z.number().int().nonnegative(),
    bboxMm: BoundsMmSchema,
    volumeMm3: z.number().nonnegative().optional(),
    centroidMm: Vec3Schema.optional(),
    watertight: z.boolean().optional(),
  })
  .strict()
  .refine((a) => a.path === `geometry/${a.id}.glb`, {
    message: "asset path must be geometry/<id>.glb",
    path: ["path"],
  })
export type GeometryAsset = z.infer<typeof GeometryAssetSchema>

/** A texture image, stored once per content address (Phase 6 uses them). */
export const TextureSchema = z
  .object({
    id: TextureIdSchema,
    path: z.string().regex(/^textures\/[0-9a-f]{64}\.(png|jpg)$/),
  })
  .strict()
  .refine((t) => t.path.startsWith(`textures/${t.id}.`), {
    message: "texture path must be textures/<id>.png|jpg",
    path: ["path"],
  })

/** Phase 2 draft: appearance is expanded to full PBR in Phase 6. */
export const MaterialSchema = z
  .object({
    id: MaterialIdSchema,
    name: NameSchema,
    builtinKey: z.string().max(64).optional(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    metalness: z.number().min(0).max(1),
    roughness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
    densityKgM3: z.number().positive(),
  })
  .strict()
export type Material = z.infer<typeof MaterialSchema>

/** Scene-graph folder. Component instances map onto a group (PLAN.md 4.7). */
export const GroupSchema = z
  .object({
    id: GroupIdSchema,
    name: NameSchema,
    parentId: GroupIdSchema.nullable(),
  })
  .strict()
export type Group = z.infer<typeof GroupSchema>

export const ColliderKindSchema = z.enum(["hull", "decomposed", "box", "trimesh", "none"])
export type ColliderKind = z.infer<typeof ColliderKindSchema>

/**
 * A placed instance of an asset. Later phases add optional fields (Phase 6 material slots,
 * Phase 9 the component reference); a v1 file never has them, so that needs no migration.
 */
export const PartSchema = z
  .object({
    id: PartIdSchema,
    name: NameSchema,
    assetId: AssetIdSchema,
    parentId: GroupIdSchema.nullable(),
    pose: PoseSchema,
    materialId: MaterialIdSchema.nullable(),
    grounded: z.boolean(),
    visible: z.boolean(),
    collider: ColliderKindSchema,
    massOverrideKg: z.number().positive().optional(),
    comOverrideMm: Vec3Schema.optional(),
  })
  .strict()
export type Part = z.infer<typeof PartSchema>
