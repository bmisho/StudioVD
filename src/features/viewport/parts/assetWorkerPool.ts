import type { AssetLoadReply, AssetLoadRequest } from "@/workers/assetLoadProtocol"
import type { DecodedAsset } from "./assetDecode"

interface Pending {
  resolve: (asset: DecodedAsset) => void
  reject: (error: Error) => void
}

interface Slot {
  worker: Worker
  waiting: Map<number, Pending>
}

// A few workers decode in parallel; each request goes to the least busy one. A worker that
// dies (out of memory on a huge asset, a module that fails to load) rejects everything it
// was given and is replaced on the next request, never in a loop.
const slots: (Slot | null)[] = []
let nextRequest = 0

function spawn(index: number): Slot {
  const worker = new Worker(new URL("../../../workers/assetLoad.worker.ts", import.meta.url), {
    type: "module",
    name: "asset-load",
  })
  const slot: Slot = { worker, waiting: new Map() }
  worker.onmessage = (event: MessageEvent<AssetLoadReply>) => {
    const reply = event.data
    const pending = slot.waiting.get(reply.requestId)
    slot.waiting.delete(reply.requestId)
    if (reply.ok) pending?.resolve(reply.asset)
    else pending?.reject(new Error(reply.message))
  }
  const fail = (message: string) => {
    for (const pending of slot.waiting.values()) pending.reject(new Error(message))
    slot.waiting.clear()
    worker.terminate()
    if (slots[index] === slot) slots[index] = null
  }
  worker.onerror = (event) => {
    event.preventDefault()
    fail(event.message || "The asset worker stopped.")
  }
  worker.onmessageerror = () => fail("The asset worker sent an unreadable reply.")
  return slot
}

const poolSize = () => Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1))

/** Decodes a stored GLB and builds its BVH in a worker (the bytes are transferred). */
export function decodeInWorker(bytes: ArrayBuffer): Promise<DecodedAsset> {
  if (slots.length === 0) slots.length = poolSize()
  let best = 0
  for (let i = 0; i < slots.length; i++) {
    const slot = (slots[i] ??= spawn(i))
    if (slot.waiting.size < (slots[best]?.waiting.size ?? Infinity)) best = i
  }
  const slot = (slots[best] ??= spawn(best))
  const requestId = ++nextRequest
  return new Promise((resolve, reject) => {
    slot.waiting.set(requestId, { resolve, reject })
    const request: AssetLoadRequest = { requestId, bytes }
    slot.worker.postMessage(request, [bytes])
  })
}
