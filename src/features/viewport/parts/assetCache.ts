import { Color, MeshStandardMaterial, type BufferGeometry } from "three"
import type { FaceInfo } from "@/core/geometry/meshData"
import { isPlaceholderAssetId } from "@/core/scene/testRig"
import type { AssetId } from "@/core/schema"
import { assetUrl, getWorkspaceInfo } from "@/lib/tauri/files"
import type { AssetLoadReply, AssetLoadRequest } from "@/workers/assetLoadProtocol"
import { HULL_NORMAL } from "../highlight/hullOutlineMaterial"
import { installBvh } from "../picking/bvh"
import { toGeometry, type DecodedAsset } from "./assetDecode"

export interface LoadedAsset {
  geometry: BufferGeometry
  /** Source colours (per-vertex or base colour); null = the default part material. */
  material: MeshStandardMaterial | null
  faces: FaceInfo[]
}

type Entry = { state: "loading" } | { state: "ready"; asset: LoadedAsset } | { state: "failed" }

const entries = new Map<AssetId, Entry>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function materialFor(asset: DecodedAsset): MeshStandardMaterial | null {
  const common = { metalness: 0, roughness: 0.55 }
  if (asset.colors) return new MeshStandardMaterial({ ...common, vertexColors: true })
  // Base colours are linear, which is three's working colour space.
  if (asset.baseColor)
    return new MeshStandardMaterial({ ...common, color: new Color(...asset.baseColor) })
  return null
}

// A few workers decode in parallel; each request goes to the least busy one.
const pool: { worker: Worker; pending: number }[] = []
const waiting = new Map<number, (reply: AssetLoadReply) => void>()
let nextRequest = 0

function decodeInWorker(bytes: ArrayBuffer): Promise<DecodedAsset> {
  if (pool.length === 0) {
    const size = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1))
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL("../../../workers/assetLoad.worker.ts", import.meta.url), {
        type: "module",
        name: "asset-load",
      })
      const slot = { worker, pending: 0 }
      worker.onmessage = (event: MessageEvent<AssetLoadReply>) => {
        slot.pending -= 1
        waiting.get(event.data.requestId)?.(event.data)
        waiting.delete(event.data.requestId)
      }
      pool.push(slot)
    }
  }
  const slot = pool.reduce((a, b) => (b.pending < a.pending ? b : a))
  const requestId = ++nextRequest
  slot.pending += 1
  return new Promise((resolve, reject) => {
    waiting.set(requestId, (reply) =>
      reply.ok ? resolve(reply.asset) : reject(new Error(reply.message))
    )
    const request: AssetLoadRequest = { requestId, bytes }
    slot.worker.postMessage(request, [bytes])
  })
}

let geometryDir: Promise<string> | null = null

async function load(id: AssetId): Promise<LoadedAsset> {
  geometryDir ??= getWorkspaceInfo().then((r) => {
    if (!r.ok) throw new Error(r.error.message)
    return r.value.geometryDir
  })
  const response = await fetch(assetUrl(await geometryDir, id))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const decoded = await decodeInWorker(await response.arrayBuffer())
  installBvh()
  return {
    geometry: toGeometry(decoded, HULL_NORMAL),
    material: materialFor(decoded),
    faces: decoded.faces,
  }
}

/**
 * Loaded asset geometry by content address (PLAN 4.6). Parts draw their bounding box until
 * the GLB is in; a missing or broken file keeps the box (and is logged). Same id, same GPU
 * buffers: never disposed, since undo can bring a deleted part back at any time.
 */
export const assetCache = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  get: (id: AssetId): LoadedAsset | undefined => {
    const entry = entries.get(id)
    return entry?.state === "ready" ? entry.asset : undefined
  },
  /** Starts loading `id` once. Placeholder assets (the test rig) have no file. */
  request: (id: AssetId): void => {
    if (entries.has(id) || isPlaceholderAssetId(id)) return
    entries.set(id, { state: "loading" })
    load(id).then(
      (asset) => {
        entries.set(id, { state: "ready", asset })
        notify()
      },
      (error: unknown) => {
        entries.set(id, { state: "failed" })
        // The plain-browser dev build has no backend: boxes are expected there.
        console.warn(`Asset ${id.slice(0, 12)}… not loaded, showing its bounding box:`, error)
      }
    )
  },
}
