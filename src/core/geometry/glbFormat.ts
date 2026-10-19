import { z } from "zod"
import { MAX_SLOTS } from "@/core/schema"
import type { FaceInfo, MeshData } from "./meshData"
import type { AssetSlot } from "./slots"

/**
 * The normalized geometry asset (PLAN 1.1 decision 3), stored as a standard glTF 2.0 GLB
 * (`geometry/<sha256>.glb`). Geometry only: names and provenance live in the document, so the
 * SHA-256 of these bytes identifies the shape and identical imports are stored once.
 *
 * Version 1 is one primitive (at most one unnamed material). Version 2 (PLAN 6.1) is one
 * primitive per material slot, all sharing the vertex attributes, each a consecutive window of
 * one index buffer, with the slot name as its glTF material name. Single-slot assets are still
 * written as version 1, byte for byte, so their content addresses never change.
 */
export interface AssetGeometry {
  mesh: MeshData
  /** Outline directions for the selection highlight (`_HULLNORMAL`, PLAN 3.6). */
  hullNormals: Float32Array
  faces: FaceInfo[]
  /** Material slots in index order, covering every triangle; one for a single-colour mesh. */
  slots: AssetSlot[]
}

export const GLB_MAGIC = 0x46546c67 // "glTF"
export const CHUNK_JSON = 0x4e4f534a // "JSON"
export const CHUNK_BIN = 0x004e4942 // "BIN\0"
export const FLOAT = 5126
export const UNSIGNED_SHORT = 5123
export const UNSIGNED_INT = 5125
export const ARRAY_BUFFER = 34962
export const ELEMENT_ARRAY_BUFFER = 34963
/** Application-specific attributes must start with "_" (glTF 2.0 §3.7.2.1). */
export const HULL_NORMAL_ATTRIBUTE = "_HULLNORMAL"
export const EXTRAS_KEY = "studiovd"
export const EXTRAS_VERSION = 1
export const EXTRAS_VERSION_SLOTS = 2

// Reading: only what our writer produces, every index and size bounded. A project file is
// untrusted input (CLAUDE.md §9), so the reader validates before touching the binary chunk.
const index = z
  .number()
  .int()
  .nonnegative()
  .max(2 ** 31)
const vec3 = z.tuple([z.number(), z.number(), z.number()])

export const FaceInfoSchema = z
  .object({
    first: index,
    last: index,
    kind: z.enum(["plane", "cylinder", "other"]),
    normal: vec3.optional(),
    axis: vec3.optional(),
    point: vec3.optional(),
    radiusMm: z.number().nonnegative().optional(),
  })
  .strict()
  .refine((f) => f.first <= f.last, "face range is reversed")

const AccessorSchema = z.object({
  bufferView: index,
  componentType: z.union([z.literal(FLOAT), z.literal(UNSIGNED_SHORT), z.literal(UNSIGNED_INT)]),
  count: index,
  type: z.enum(["SCALAR", "VEC3"]),
  byteOffset: index.optional(),
})

const PrimitiveSchema = z.object({
  attributes: z.record(z.string(), index),
  indices: index,
  material: index.optional(),
  mode: z.literal(4).optional(),
})

export const GltfJsonSchema = z.object({
  asset: z.object({ version: z.literal("2.0") }).loose(),
  accessors: z.array(AccessorSchema).max(4 + MAX_SLOTS),
  bufferViews: z
    .array(z.object({ buffer: z.literal(0), byteOffset: index.optional(), byteLength: index }))
    .max(16),
  meshes: z
    .array(
      z.object({
        primitives: z.array(PrimitiveSchema).min(1).max(MAX_SLOTS),
        extras: z
          .object({
            [EXTRAS_KEY]: z.object({
              v: z.union([z.literal(EXTRAS_VERSION), z.literal(EXTRAS_VERSION_SLOTS)]),
              faces: z.array(FaceInfoSchema).max(1_000_000),
            }),
          })
          .optional(),
      })
    )
    .length(1),
  materials: z
    .array(
      z.object({
        name: z.string().max(120).optional(),
        pbrMetallicRoughness: z
          .object({
            baseColorFactor: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
          })
          .loose(),
      })
    )
    .max(MAX_SLOTS)
    .optional(),
})
export type GltfJson = z.infer<typeof GltfJsonSchema>
