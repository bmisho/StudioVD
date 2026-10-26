import { z } from "zod"
import { AssetLicenseSchema } from "./component/license"
import {
  AssetIdSchema,
  ComponentInstanceIdSchema,
  GroupIdSchema,
  MaterialIdSchema,
  PartIdSchema,
  TextureIdSchema,
} from "./ids"
import { AssetSlotsSchema, MaterialSlotsSchema } from "./material"
import { LocalKeySchema, NameSchema, PoseSchema, Vec3MmSchema } from "./primitives"

/** Part-local bounds; `min` never exceeds `max` on any axis. */
export const BoundsMmSchema = z
  .object({ min: Vec3MmSchema, max: Vec3MmSchema })
  .strict()
  .refine((b) => b.min.every((v, i) => v <= (b.max[i] ?? v)), "bbox min must not exceed max")

/**
 * A normalized mesh, stored once per content address at `geometry/<id>.glb`. Library
 * geometry carries its licence (CLAUDE.md §12, Phase 9); a user's own import has none.
 */
export const GeometryAssetSchema = z
  .object({
    id: AssetIdSchema,
    path: z.string().regex(/^geometry\/[0-9a-f]{64}\.glb$/),
    triangleCount: z.number().int().nonnegative(),
    bboxMm: BoundsMmSchema,
    volumeMm3: z.number().nonnegative().optional(),
    centroidMm: Vec3MmSchema.optional(),
    watertight: z.boolean().optional(),
    /** Material slot names, when the GLB has two or more (one glTF primitive each). */
    slots: AssetSlotsSchema.optional(),
    license: AssetLicenseSchema.optional(),
  })
  .strict()
  .refine((a) => a.path === `geometry/${a.id}.glb`, {
    message: "asset path must be geometry/<id>.glb",
    path: ["path"],
  })
export type GeometryAsset = z.infer<typeof GeometryAssetSchema>

/** A texture image (PNG or JPG), stored once per content address; materials refer to it. */
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
export type Texture = z.infer<typeof TextureSchema>

/** Scene-graph folder. Component instances map onto a group (PLAN.md 4.7). */
export const GroupSchema = z
  .object({
    id: GroupIdSchema,
    name: NameSchema,
    parentId: GroupIdSchema.nullable(),
  })
  .strict()
export type Group = z.infer<typeof GroupSchema>

/** An entity a component instance made, by the instance and the manifest's local key. */
export const ComponentRefSchema = z
  .object({ instance: ComponentInstanceIdSchema, key: LocalKeySchema })
  .strict()
export type ComponentRef = z.infer<typeof ComponentRefSchema>

export const ColliderKindSchema = z.enum(["hull", "decomposed", "box", "trimesh", "none"])
export type ColliderKind = z.infer<typeof ColliderKindSchema>

/**
 * A placed instance of an asset. `materialId` is the part's material (appearance and density);
 * `materialSlots` overrides it on some of the asset's slots (appearance only). Optional fields
 * later phases add need no migration (Phase 9: `componentRef`).
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
    comOverrideMm: Vec3MmSchema.optional(),
    materialSlots: MaterialSlotsSchema.optional(),
    /** The library component instance that made it, and its key in that manifest. */
    componentRef: ComponentRefSchema.optional(),
  })
  .strict()
export type Part = z.infer<typeof PartSchema>
