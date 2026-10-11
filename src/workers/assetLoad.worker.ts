/// <reference lib="webworker" />
import { decodeAsset, transferablesOf } from "@/features/viewport/parts/assetDecode"
import type { AssetLoadReply, AssetLoadRequest } from "./assetLoadProtocol"

// Asset worker: decodes stored GLBs and builds their BVH off the main thread (CLAUDE.md §6).

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<AssetLoadRequest>) => {
  const { requestId, bytes } = event.data
  try {
    const asset = decodeAsset(new Uint8Array(bytes))
    const reply: AssetLoadReply = { requestId, ok: true, asset }
    scope.postMessage(reply, transferablesOf(asset))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const reply: AssetLoadReply = { requestId, ok: false, message }
    scope.postMessage(reply)
  }
}
