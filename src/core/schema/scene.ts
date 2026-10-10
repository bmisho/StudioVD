import { z } from "zod"
import {
  AssetIdSchema,
  ComponentInstanceIdSchema,
  GroupIdSchema,
  MaterialIdSchema,
  PartIdSchema,
  TextureIdSchema,
} from "./ids"
import { NameSchema, PoseSchema, SpdxSchema, Vec3Schema } from "./primitives"

/** Licence metadata carried by every geometry asset (CLAUDE.md §12). */
export const AssetLicenseSchema = z
  .object({
    spdx: SpdxSchema,
    creators: z.array(z.string().max(200)).max(32),
    sourceUrl: z.string().url().max(2048).optional(),
    sourceRevision: z.string().max(128).optional(),
    modifications: z.string().max(1000).optional(),
    licenseTextSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  })
  .strict()

export const GeometryAssetSchema = z
  .object({
    id: AssetIdSchema,
    path: z.string().regex(/^geometry\/[0-9a-f]{64}\.glb$/),
    triangleCount: z.number().int().nonnegative(),
    bboxMm: z.object({ min: Vec3Schema, max: Vec3Schema }).strict(),
    volumeMm3: z.number().nonnegative().optional(),
    centroidMm: Vec3Schema.optional(),
    watertight: z.boolean().optional(),
    license: AssetLicenseSchema.optional(),
  })
  .strict()
export type GeometryAsset = z.infer<typeof GeometryAssetSchema>

export const TextureSchema = z
  .object({
    id: TextureIdSchema,
    path: z.string().regex(/^textures\/[0-9a-f]{64}\.(png|jpg)$/),
  })
  .strict()

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

export const PartSchema = z
  .object({
    id: PartIdSchema,
    name: NameSchema,
    assetId: AssetIdSchema,
    parentId: GroupIdSchema.nullable(),
    pose: PoseSchema,
    materialId: MaterialIdSchema.nullable(),
    /** glTF material name -> project material, for multi-colour imports. */
    materialSlots: z.record(z.string().max(120), MaterialIdSchema).optional(),
    grounded: z.boolean(),
    visible: z.boolean(),
    collider: ColliderKindSchema,
    massOverrideKg: z.number().positive().optional(),
    comOverrideMm: Vec3Schema.optional(),
    componentRef: z
      .object({ instance: ComponentInstanceIdSchema, key: z.string().max(32) })
      .strict()
      .optional(),
  })
  .strict()
export type Part = z.infer<typeof PartSchema>
