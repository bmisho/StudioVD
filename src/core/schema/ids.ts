import { z } from "zod"

/**
 * Branded entity IDs (CLAUDE.md §3). Minted ids are lowercase UUIDs (`crypto.randomUUID()`),
 * checked by shape: an opened file cannot use `constructor` or a content hash as an id. The
 * brand stops a PartId being passed where a MateId is expected.
 */
const mintedId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "must be a UUID")

export const PartIdSchema = mintedId.brand<"PartId">()
export const GroupIdSchema = mintedId.brand<"GroupId">()
export const MaterialIdSchema = mintedId.brand<"MaterialId">()
export const AnchorIdSchema = mintedId.brand<"AnchorId">()
export const MateIdSchema = mintedId.brand<"MateId">()
export const CouplingIdSchema = mintedId.brand<"CouplingId">()
export const NodeIdSchema = mintedId.brand<"NodeId">()
export const EdgeIdSchema = mintedId.brand<"EdgeId">()
export const BlockDefIdSchema = mintedId.brand<"BlockDefId">()
export const BindingIdSchema = mintedId.brand<"BindingId">()
export const ComponentInstanceIdSchema = mintedId.brand<"ComponentInstanceId">()

/** Lowercase hex SHA-256: the content address of every file in a project bundle. */
export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, "must be a lowercase SHA-256")

/** Content address of a geometry asset: SHA-256 of the normalized GLB. */
export const AssetIdSchema = Sha256Schema.brand<"AssetId">()
/** Content address of a texture image: SHA-256 of the PNG/JPG bytes. */
export const TextureIdSchema = Sha256Schema.brand<"TextureId">()

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
