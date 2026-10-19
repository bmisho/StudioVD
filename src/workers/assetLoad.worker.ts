/// <reference lib="webworker" />
import { featureEdges } from "@/core/geometry/featureEdges"
import { decodeAsset, transferablesOf } from "@/features/viewport/parts/assetDecode"
import type { AssetLoadReply, AssetLoadRequest } from "./assetLoadProtocol"

// Asset worker: decodes stored GLBs and builds their BVH, and finds feature edges, off the
// main thread (CLAUDE.md §6).

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<AssetLoadRequest>) => {
  const request = event.data
  const { requestId } = request
  try {
    if (request.kind === "decode") {
      const asset = decodeAsset(new Uint8Array(request.bytes))
      const reply: AssetLoadReply = { kind: "decode", requestId, ok: true, asset }
      scope.postMessage(reply, transferablesOf(asset))
    } else {
      const { positions, indices, faces, angleDeg } = request
      const edges = featureEdges({ positions, indices }, faces, angleDeg)
      const reply: AssetLoadReply = { kind: "edges", requestId, ok: true, edges }
      scope.postMessage(reply, [edges.buffer])
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const reply: AssetLoadReply = { requestId, ok: false, message }
    scope.postMessage(reply)
  }
}
