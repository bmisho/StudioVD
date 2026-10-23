import { BufferAttribute, BufferGeometry } from "three"
import type { FaceInfo } from "@/core/geometry/meshData"
import type { SnapFeatures } from "@/core/geometry/snapFeatures"
import type { AssetSlot } from "@/core/geometry/slots"
import { isPlaceholderAssetId } from "@/core/scene/testRig"
import type { AssetId, GeometryAsset } from "@/core/schema"
import { assetUrl } from "@/lib/tauri/files"
import { HULL_NORMAL } from "../highlight/hullOutlineMaterial"
import { installBvh } from "../picking/bvh"
import { toGeometry } from "./assetDecode"
import { decodeInWorker, edgesInWorker, snapsInWorker } from "./assetWorkerPool"

export interface LoadedAsset {
  geometry: BufferGeometry
  faces: FaceInfo[]
  /** Material slots with their source colours (one for a single-colour mesh). */
  slots: AssetSlot[]
}

type Entry<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "failed" }

const entries = new Map<AssetId, Entry<LoadedAsset>>()
/** Feature edges per asset, computed on first use (an edges display mode). */
const edgeEntries = new Map<AssetId, Entry<BufferGeometry>>()
/** Anchor snap features per asset, computed on first use (the Place Anchor tool). */
const snapEntries = new Map<AssetId, Entry<SnapFeatures>>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
const ready = <T>(entry: Entry<T> | undefined) =>
  entry?.state === "ready" ? entry.value : undefined

/**
 * The GLB's slots are the ones the document lists (a project file is untrusted: per-slot
 * materials are edited by the document's names and drawn by the GLB's).
 */
function slotsAgree(loaded: LoadedAsset, asset: GeometryAsset): boolean {
  const names = asset.slots
  if (!names) return loaded.slots.length === 1
  return names.length === loaded.slots.length && loaded.slots.every((s, i) => s.name === names[i])
}
const disagreeing = new Set<AssetId>()

async function load(id: AssetId): Promise<LoadedAsset> {
  const response = await fetch(assetUrl(id))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const decoded = await decodeInWorker(await response.arrayBuffer())
  installBvh()
  return { geometry: toGeometry(decoded, HULL_NORMAL), faces: decoded.faces, slots: decoded.slots }
}

/**
 * Line segments over the asset's own position buffer (no second vertex copy). Disposed only
 * with the asset: disposing it would also free the shared position buffer on the GPU.
 */
async function loadEdges({ geometry, faces }: LoadedAsset): Promise<BufferGeometry> {
  const position = geometry.getAttribute("position")
  const index = geometry.getIndex()
  if (!(position.array instanceof Float32Array) || !(index?.array instanceof Uint32Array))
    throw new Error("unexpected asset buffers")
  const pairs = await edgesInWorker(position.array, index.array, faces)
  const edges = new BufferGeometry()
  edges.setAttribute("position", position)
  edges.setIndex(new BufferAttribute(pairs, 1))
  // Or three walks every vertex to find them.
  edges.boundingBox = geometry.boundingBox?.clone() ?? null
  edges.boundingSphere = geometry.boundingSphere?.clone() ?? null
  return edges
}

/**
 * Loaded asset geometry by content address (PLAN 4.6). Parts draw their bounding box until
 * the GLB is in; a missing or broken file keeps the box (and is logged). Same id, same GPU
 * buffers: kept while the document's history can bring a part back, and released only when
 * another document replaces it (`retain`, PLAN 5.3).
 */
export const assetCache = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  get: (id: AssetId): LoadedAsset | undefined => ready(entries.get(id)),
  /** The loaded asset if its slots match the document's record, else undefined (the box). */
  getFor: (asset: GeometryAsset): LoadedAsset | undefined => {
    const loaded = ready(entries.get(asset.id))
    if (!loaded || slotsAgree(loaded, asset)) return loaded
    if (!disagreeing.has(asset.id)) {
      disagreeing.add(asset.id)
      console.warn(`Asset ${asset.id.slice(0, 12)}… has other slots than the project lists.`)
    }
    return undefined
  },
  /** The asset's anchor snap features once computed (`requestSnaps`). */
  snaps: (id: AssetId): SnapFeatures | undefined => ready(snapEntries.get(id)),
  /** The asset's feature edges once computed (`requestEdges`). */
  edges: (id: AssetId): BufferGeometry | undefined => ready(edgeEntries.get(id)),
  /** Whether computing the asset's feature edges failed (until `retain` forgets it). */
  edgesFailed: (id: AssetId): boolean => edgeEntries.get(id)?.state === "failed",
  /**
   * A new document replaced the open one (New, Open): frees geometry it does not use, and
   * forgets failed loads, since its workspace may hold the files an earlier one lacked.
   */
  retain: (ids: ReadonlySet<string>): void => {
    for (const [id, entry] of entries) {
      if (entry.state === "loading" || (entry.state === "ready" && ids.has(id))) continue
      if (entry.state === "ready") entry.value.geometry.dispose()
      entries.delete(id)
      if (snapEntries.get(id)?.state !== "loading") snapEntries.delete(id)
      const edges = edgeEntries.get(id)
      if (edges?.state === "loading") continue // dropped when it arrives
      if (edges?.state === "ready") edges.value.dispose()
      edgeEntries.delete(id)
    }
  },
  /** Starts loading `id` once. Placeholder assets (the test rig) have no file. */
  request: (id: AssetId): void => {
    if (entries.has(id) || isPlaceholderAssetId(id)) return
    entries.set(id, { state: "loading" })
    load(id).then(
      (value) => {
        entries.set(id, { state: "ready", value })
        notify()
      },
      (error: unknown) => {
        entries.set(id, { state: "failed" })
        // The plain-browser dev build has no backend: boxes are expected there.
        console.warn(`Asset ${id.slice(0, 12)}… not loaded, showing its bounding box:`, error)
      }
    )
  },
  /** Computes the feature edges of a loaded asset once, in the asset worker. */
  requestEdges: (id: AssetId): void => {
    const asset = ready(entries.get(id))
    if (!asset || edgeEntries.has(id)) return
    edgeEntries.set(id, { state: "loading" })
    loadEdges(asset).then(
      (value) => {
        if (ready(entries.get(id)) !== asset) {
          // Released (and maybe loaded again) meanwhile: these lines index freed buffers.
          edgeEntries.delete(id)
          assetCache.requestEdges(id)
          return
        }
        edgeEntries.set(id, { state: "ready", value })
        notify()
      },
      (error: unknown) => {
        edgeEntries.set(id, { state: "failed" })
        console.warn(`Edges of asset ${id.slice(0, 12)}… not computed:`, error)
      }
    )
  },
  /** Computes the anchor snap features of a loaded asset once, in the asset worker. */
  requestSnaps: (id: AssetId): void => {
    const asset = ready(entries.get(id))
    if (!asset || snapEntries.has(id)) return
    snapEntries.set(id, { state: "loading" })
    const position = asset.geometry.getAttribute("position")
    const index = asset.geometry.getIndex()
    if (!(position.array instanceof Float32Array) || !(index?.array instanceof Uint32Array)) {
      snapEntries.set(id, { state: "failed" })
      return
    }
    snapsInWorker(position.array, index.array, asset.faces).then(
      (value) => {
        if (ready(entries.get(id)) !== asset) {
          snapEntries.delete(id) // released (and maybe loaded again) meanwhile
          assetCache.requestSnaps(id)
          return
        }
        snapEntries.set(id, { state: "ready", value })
        notify()
      },
      (error: unknown) => {
        snapEntries.set(id, { state: "failed" })
        console.warn(`Snap features of asset ${id.slice(0, 12)}… not computed:`, error)
      }
    )
  },
}
