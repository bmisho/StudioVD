import type { TriangleRange } from "@/core/geometry/featureEdges"
import type { DecodedAsset } from "@/features/viewport/parts/assetDecode"

/**
 * Main thread -> asset worker. `decode`: the stored GLB bytes (transferred). `edges`: feature
 * edges of a decoded asset (PLAN 6.6); its arrays are copies, since the originals back the GPU
 * geometry on the main thread.
 */
export type AssetLoadRequest =
  | { kind: "decode"; requestId: number; bytes: ArrayBuffer }
  | {
      kind: "edges"
      requestId: number
      positions: Float32Array
      indices: Uint32Array
      faces: TriangleRange[]
      angleDeg?: number
    }

/** Asset worker -> main thread; a reply's `kind` matches its request's, errors carry none. */
export type AssetLoadReply =
  | { kind: "decode"; requestId: number; ok: true; asset: DecodedAsset }
  | { kind: "edges"; requestId: number; ok: true; edges: Uint32Array }
  | { requestId: number; ok: false; message: string }
