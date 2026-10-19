import type { Material as ThreeMaterial } from "three"
import { physicalParams } from "@/core/materials/physicalParams"
import { materialMaps, type Material } from "@/core/schema"
import { viewportBridge, type ViewportApi } from "@/features/viewport/viewportBridge"

/** Images kept (least recently used dropped first): about 7 MB at 96 px tiles. */
export const MAX_PREVIEWS = 200
/** While the 3D view cannot render (no size yet, lost context), ask again this often. */
export const RETRY_MS = 1000
/** Fewest ms between renders: each one also redraws the 3D view (a slider scrub asks a lot). */
export const MIN_INTERVAL_MS = 100
/** Most tiles per render, so one main-thread task stays short. */
export const MAX_PER_RENDER = 32

/** The appearance key of a built-in preset (its values never change). */
export const presetAppearanceKey = (builtinKey: string): string => `p:${builtinKey}`

/**
 * The appearance key of a document material: everything that changes how it renders, so an
 * edit gets a new preview and undoing it finds the old one again.
 */
export function materialAppearanceKey(material: Material): string {
  const maps = materialMaps(material)
    .map(([kind, map]) => [kind, map.textureId, map.tileSizeMm] as const)
    .sort((a, b) => a[0].localeCompare(b[0]))
  return `m:${JSON.stringify([physicalParams(material), maps])}`
}

interface Request {
  id: string
  key: string
  px: number
  material: ThreeMaterial
}

type Bridge = Pick<ViewportApi, "isReady" | "renderMaterialPreviews">

const byTileSize = (requests: readonly Request[]) => {
  const groups = new Map<number, Request[]>()
  for (const r of requests) groups.set(r.px, [...(groups.get(r.px) ?? []), r])
  return groups
}

/** Drops the oldest entries (Map order) beyond `max`. */
function trim(map: Map<string, unknown>, max: number) {
  for (const id of map.keys()) {
    if (map.size <= max) return
    map.delete(id)
  }
}

export function createPreviewCache(bridge: Bridge) {
  /** null: rendering failed; never retried, so a broken material cannot loop. */
  const images = new Map<string, ImageData | null>()
  const pending = new Map<string, Request>()
  /** The key each three.js material was last asked for: document materials change in place. */
  const latest = new WeakMap<ThreeMaterial, string>()
  const listeners = new Set<() => void>()
  let queued = false
  let busy = false
  let lastRender = -Infinity

  const idOf = (key: string, px: number) => `${key}@${px}`

  function settle(request: Request, image: ImageData | null) {
    pending.delete(request.id)
    // Edited since it was asked for: the pixels may show the new values under the old key.
    if (latest.get(request.material) !== request.key) return
    images.set(request.id, image)
    trim(images, MAX_PREVIEWS)
  }

  /** One flush at a time: the same tick (microtask) or after `delayMs`. */
  function schedule(delayMs: number) {
    if (queued || busy || pending.size === 0) return
    queued = true
    const run = () => {
      queued = false
      void flush()
    }
    if (delayMs > 0) setTimeout(run, delayMs)
    else queueMicrotask(run)
  }

  async function flush() {
    const wait = bridge.isReady() ? lastRender + MIN_INTERVAL_MS - Date.now() : RETRY_MS
    if (wait > 0) {
      schedule(wait)
      return
    }
    for (const r of pending.values()) if (latest.get(r.material) !== r.key) pending.delete(r.id)
    busy = true
    let retry = false
    try {
      const batch = [...pending.values()].slice(0, MAX_PER_RENDER)
      for (const [px, requests] of byTileSize(batch)) {
        try {
          const result = await bridge.renderMaterialPreviews(
            requests.map((r) => r.material),
            px
          )
          if (result) requests.forEach((r, i) => settle(r, result[i] ?? null))
          else retry = true // kept pending
        } catch (error) {
          console.warn("Material previews not rendered:", error)
          for (const r of requests) settle(r, null)
        }
      }
    } finally {
      busy = false
      lastRender = Date.now()
    }
    listeners.forEach((l) => l())
    schedule(retry ? RETRY_MS : MIN_INTERVAL_MS)
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** The preview of `key` at `px` device px, once rendered. */
    get(key: string, px: number): ImageData | undefined {
      const id = idOf(key, px)
      const image = images.get(id)
      if (image) {
        images.delete(id) // most recently used goes last
        images.set(id, image)
      }
      return image ?? undefined
    },
    /**
     * Asks for a preview of `material` (which must look like `key` now). Requests in the same
     * tick share one render; while the 3D view cannot render they wait and are retried.
     */
    request(key: string, material: ThreeMaterial, px: number): void {
      latest.set(material, key)
      const id = idOf(key, px)
      if (images.has(id) || pending.has(id)) return
      pending.set(id, { id, key, px, material })
      trim(pending, MAX_PREVIEWS)
      schedule(0)
    },
  }
}

export type PreviewCache = ReturnType<typeof createPreviewCache>

/** Session cache of material previews (PLAN 6.3): transient, never in the store. */
export const previewCache = createPreviewCache(viewportBridge)
