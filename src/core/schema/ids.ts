import { z } from "zod"

/**
 * Branded entity IDs (CLAUDE.md §3). Runtime values are opaque strings, usually
 * `crypto.randomUUID()`; the brand stops a PartId being passed where a MateId is expected.
 */
const idString = z.string().min(1).max(128)

export const PartIdSchema = idString.brand<"PartId">()
export const GroupIdSchema = idString.brand<"GroupId">()
export const MaterialIdSchema = idString.brand<"MaterialId">()
export const TextureIdSchema = idString.brand<"TextureId">()
export const AnchorIdSchema = idString.brand<"AnchorId">()
export const MateIdSchema = idString.brand<"MateId">()
export const CouplingIdSchema = idString.brand<"CouplingId">()
export const NodeIdSchema = idString.brand<"NodeId">()
export const EdgeIdSchema = idString.brand<"EdgeId">()
export const BlockDefIdSchema = idString.brand<"BlockDefId">()
export const BindingIdSchema = idString.brand<"BindingId">()
export const ComponentInstanceIdSchema = idString.brand<"ComponentInstanceId">()

/** Content address of a geometry asset: lowercase hex SHA-256 of the normalized GLB. */
export const AssetIdSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .brand<"AssetId">()

/** Natural key of a library component snapshot: `<namespace>/<slug>@<semver>#<12 hex>`. */
export const ComponentDefKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,31}\/[a-z0-9][a-z0-9._-]{0,63}@[0-9A-Za-z.+-]{1,64}#[0-9a-f]{12}$/)
  .brand<"ComponentDefKey">()

export type PartId = z.infer<typeof PartIdSchema>
export type GroupId = z.infer<typeof GroupIdSchema>
export type MaterialId = z.infer<typeof MaterialIdSchema>
export type TextureId = z.infer<typeof TextureIdSchema>
export type AnchorId = z.infer<typeof AnchorIdSchema>
export type MateId = z.infer<typeof MateIdSchema>
export type CouplingId = z.infer<typeof CouplingIdSchema>
export type NodeId = z.infer<typeof NodeIdSchema>
export type EdgeId = z.infer<typeof EdgeIdSchema>
export type BlockDefId = z.infer<typeof BlockDefIdSchema>
export type BindingId = z.infer<typeof BindingIdSchema>
export type ComponentInstanceId = z.infer<typeof ComponentInstanceIdSchema>
export type AssetId = z.infer<typeof AssetIdSchema>
export type ComponentDefKey = z.infer<typeof ComponentDefKeySchema>

/** IDs that are minted locally (content-addressed and natural keys are excluded). */
export type MintedId =
  | PartId
  | GroupId
  | MaterialId
  | TextureId
  | AnchorId
  | MateId
  | CouplingId
  | NodeId
  | EdgeId
  | BlockDefId
  | BindingId
  | ComponentInstanceId

/** Mints a new opaque ID. The cast is the single place a plain string becomes a branded ID. */
export function newId<T extends MintedId>(): T {
  return crypto.randomUUID() as T
}
