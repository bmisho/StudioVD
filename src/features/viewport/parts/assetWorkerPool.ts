import type { TriangleRange } from "@/core/geometry/featureEdges"
import type { FaceInfo } from "@/core/geometry/meshData"
import type { SnapFeatures } from "@/core/geometry/snapFeatures"
import type { AssetLoadReply, AssetLoadRequest } from "@/workers/assetLoadProtocol"
import type { DecodedAsset } from "./assetDecode"

/** A request waiting for its reply, typed by the kind of payload it resolves with. */
type Pending =
  | { kind: "decode"; resolve: (asset: DecodedAsset) => void; reject: (error: Error) => void }
  | { kind: "edges"; resolve: (edges: Uint32Array) => void; reject: (error: Error) => void }
  | { kind: "snaps"; resolve: (snaps: SnapFeatures) => void; reject: (error: Error) => void }

interface Slot {
  worker: Worker
  waiting: Map<number, Pending>
}

// A few workers decode in parallel; each request goes to the least busy one. A worker that
// dies (out of memory on a huge asset, a module that fails to load) rejects everything it
// was given and is replaced on the next request, never in a loop.
const slots: (Slot | null)[] = []
let nextRequest = 0

/** Resolves with the reply's payload, or rejects an error or a reply of the wrong kind. */
function settle(pending: Pending, reply: AssetLoadReply): void {
  if (!reply.ok) pending.reject(new Error(reply.message))
  else if (pending.kind === "decode" && reply.kind === "decode") pending.resolve(reply.asset)
  else if (pending.kind === "edges" && reply.kind === "edges") pending.resolve(reply.edges)
  else if (pending.kind === "snaps" && reply.kind === "snaps") pending.resolve(reply.snaps)
  else
    pending.reject(
      new Error(
        `The asset worker's ${reply.kind} reply does not match its ${pending.kind} request.`
      )
    )
}

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
    if (pending) settle(pending, reply)
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

/** Posts a request to the least busy worker (spawning any missing one) and waits for it. */
function send(pending: Pending, request: AssetLoadRequest, transfer: Transferable[]): void {
  if (slots.length === 0) slots.length = poolSize()
  let best = 0
  for (let i = 0; i < slots.length; i++) {
    const slot = (slots[i] ??= spawn(i))
    if (slot.waiting.size < (slots[best]?.waiting.size ?? Infinity)) best = i
  }
  const slot = (slots[best] ??= spawn(best))
  slot.waiting.set(request.requestId, pending)
  try {
    slot.worker.postMessage(request, transfer)
  } catch (error) {
    slot.waiting.delete(request.requestId) // not sent (a detached buffer): not waiting either
    throw error
  }
}

/** Decodes a stored GLB and builds its BVH in a worker (the bytes are transferred). */
export function decodeInWorker(bytes: ArrayBuffer): Promise<DecodedAsset> {
  return new Promise((resolve, reject) => {
    const request: AssetLoadRequest = { kind: "decode", requestId: ++nextRequest, bytes }
    send({ kind: "decode", resolve, reject }, request, [bytes])
  })
}

/**
 * Feature edges of a decoded asset (PLAN 6.6) in a worker: vertex index pairs for a
 * LineSegments index sharing the asset's position attribute. The arrays back the GPU geometry
 * here, so they are copied (structured clone), never transferred; the faces are sent as bare
 * ranges. `angleDeg` defaults to `FEATURE_EDGE_DEG`.
 */
export function edgesInWorker(
  positions: Float32Array,
  indices: Uint32Array,
  faces: readonly TriangleRange[],
  angleDeg?: number
): Promise<Uint32Array> {
  return new Promise((resolve, reject) => {
    const request: AssetLoadRequest = {
      kind: "edges",
      requestId: ++nextRequest,
      positions,
      indices,
      faces: faces.map(({ first, last }) => ({ first, last })),
      ...(angleDeg === undefined ? {} : { angleDeg }),
    }
    send({ kind: "edges", resolve, reject }, request, [])
  })
}

/** Anchor snap features of a decoded asset (PLAN 7.3), in a worker; arrays copied as for edges. */
export function snapsInWorker(
  positions: Float32Array,
  indices: Uint32Array,
  faces: readonly FaceInfo[]
): Promise<SnapFeatures> {
  return new Promise((resolve, reject) => {
    const request: AssetLoadRequest = {
      kind: "snaps",
      requestId: ++nextRequest,
      positions,
      indices,
      faces: [...faces],
    }
    send({ kind: "snaps", resolve, reject }, request, [])
  })
}
