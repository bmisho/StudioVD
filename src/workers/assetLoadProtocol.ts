import type { DecodedAsset } from "@/features/viewport/parts/assetDecode"

/** Main thread -> asset worker: the stored GLB bytes (transferred). */
export interface AssetLoadRequest {
  requestId: number
  bytes: ArrayBuffer
}

/** Asset worker -> main thread. */
export type AssetLoadReply =
  | { requestId: number; ok: true; asset: DecodedAsset }
  | { requestId: number; ok: false; message: string }
