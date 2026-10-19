import { Color, MeshStandardMaterial, type BufferGeometry } from "three"
import type { FaceInfo } from "@/core/geometry/meshData"
import type { AssetSlot } from "@/core/geometry/slots"
import { isPlaceholderAssetId } from "@/core/scene/testRig"
import type { AssetId } from "@/core/schema"
import { assetUrl } from "@/lib/tauri/files"
import { HULL_NORMAL } from "../highlight/hullOutlineMaterial"
import { installBvh } from "../picking/bvh"
import { toGeometry, type DecodedAsset } from "./assetDecode"
import { decodeInWorker } from "./assetWorkerPool"

export interface LoadedAsset {
  geometry: BufferGeometry
  /** Source colours (per-vertex or base colour); null = the default part material. */
  material: MeshStandardMaterial | null
  faces: FaceInfo[]
  slots: AssetSlot[]
}

type Entry = { state: "loading" } | { state: "ready"; asset: LoadedAsset } | { state: "failed" }

const entries = new Map<AssetId, Entry>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function materialFor(asset: DecodedAsset): MeshStandardMaterial | null {
  const common = { metalness: 0, roughness: 0.55 }
  if (asset.colors) return new MeshStandardMaterial({ ...common, vertexColors: true })
  // Base colours are linear, which is three's working colour space.
  const color = asset.slots[0]?.color
  return color ? new MeshStandardMaterial({ ...common, color: new Color(...color) }) : null
}

async function load(id: AssetId): Promise<LoadedAsset> {
  const response = await fetch(assetUrl(id))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const decoded = await decodeInWorker(await response.arrayBuffer())
  installBvh()
  return {
    geometry: toGeometry(decoded, HULL_NORMAL),
    material: materialFor(decoded),
    faces: decoded.faces,
    slots: decoded.slots,
  }
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
  get: (id: AssetId): LoadedAsset | undefined => {
    const entry = entries.get(id)
    return entry?.state === "ready" ? entry.asset : undefined
  },
  /**
   * A new document replaced the open one (New, Open): frees geometry it does not use, and
   * forgets failed loads, since its workspace may hold the files an earlier one lacked.
   */
  retain: (ids: ReadonlySet<string>): void => {
    for (const [id, entry] of entries) {
      if (entry.state === "loading" || (entry.state === "ready" && ids.has(id))) continue
      if (entry.state === "ready") {
        entry.asset.geometry.dispose()
        entry.asset.material?.dispose()
      }
      entries.delete(id)
    }
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
