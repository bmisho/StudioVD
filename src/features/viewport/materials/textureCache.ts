import { NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture } from "three"
import type { TextureId } from "@/core/schema"
import { textureUrl } from "@/lib/tauri/files"
import { MAX_TEXTURE_SIDE_PX, decodeTexture, oneAtATime } from "./textureDecode"

export { MAX_TEXTURE_SIDE_PX }

/** How a map's texels are read: colour (sRGB, decoded to linear by the GPU) or raw data. */
export type TextureKind = "color" | "data"

/**
 * Most image pixels kept at once, after resampling: 32 images at the side limit (512 MB of
 * RGBA). A project file is untrusted, and a thousand 8 KB PNGs can each claim 8192 px a side;
 * past the budget, maps are drawn without (and logged), and nothing more is decoded.
 */
export const TEXTURE_BUDGET_PX = 32 * MAX_TEXTURE_SIDE_PX ** 2

type Image =
  | { state: "loading" }
  | { state: "ready"; bitmap: ImageBitmap; uses: Partial<Record<TextureKind, Texture>> }
  | { state: "failed" }

/** By content address: a colour and a data use share one decoded bitmap. */
const images = new Map<string, Image>()
let keptPx = 0
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
const pixels = (bitmap: ImageBitmap) => bitmap.width * bitmap.height

/** A use of a decoded image: its own Texture (colour space), on the shared bitmap. */
function textureFor(image: Extract<Image, { state: "ready" }>, kind: TextureKind): Texture {
  const existing = image.uses[kind]
  if (existing) return existing
  const texture = new Texture(image.bitmap)
  texture.flipY = false // flipped at decode (three would ignore it for a bitmap anyway)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = kind === "color" ? SRGBColorSpace : NoColorSpace
  texture.needsUpdate = true
  image.uses[kind] = texture
  return texture
}

async function load(record: { id: TextureId; path: string }): Promise<ImageBitmap> {
  const ext = /\.(png|jpg)$/.exec(record.path)?.[1]
  if (!ext) throw new Error(`unexpected texture path ${record.path}`)
  const response = await fetch(textureUrl(record.id, ext))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return decodeTexture(await response.blob())
}

const overBudget = () =>
  new Error(`over the ${TEXTURE_BUDGET_PX / 2 ** 20} Mpx kept for the project's textures`)

/**
 * Material texture images by content address (PLAN 6.3), like the asset cache: loaded once
 * from the `stvd` scheme, one at a time, kept while the open document lists them, released
 * when another document replaces it (`retain`). A missing or broken image, or one past the
 * budget, draws the material without that map (and is logged).
 */
export const textureCache = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  get: (id: TextureId, kind: TextureKind): Texture | undefined => {
    const image = images.get(id)
    return image?.state === "ready" ? textureFor(image, kind) : undefined
  },
  /**
   * A new document replaced the open one (New, Open): frees images it does not list, drops
   * their loads (queued or in flight), and forgets failed loads, since its workspace may hold
   * the files an earlier one lacked. Subscribers hear of a freed texture, so no material keeps
   * drawing it.
   */
  retain: (ids: ReadonlySet<string>): void => {
    let freed = false
    for (const [id, image] of images) {
      if (ids.has(id) && image.state !== "failed") continue
      if (image.state === "ready") {
        for (const texture of Object.values(image.uses)) texture.dispose()
        image.bitmap.close()
        keptPx -= pixels(image.bitmap)
        freed = true
      }
      images.delete(id)
    }
    if (freed) notify()
  },
  /** Starts loading `record` once (a failure is not retried until `retain`). */
  request: (record: { id: TextureId; path: string }): void => {
    if (images.has(record.id)) return
    const entry: Image = { state: "loading" }
    images.set(record.id, entry)
    const wanted = () => images.get(record.id) === entry // not dropped by `retain`
    oneAtATime(async () => {
      if (!wanted()) return
      if (keptPx >= TEXTURE_BUDGET_PX) throw overBudget()
      const bitmap = await load(record)
      if (!wanted()) return bitmap.close()
      if (keptPx + pixels(bitmap) > TEXTURE_BUDGET_PX) {
        bitmap.close()
        throw overBudget()
      }
      keptPx += pixels(bitmap)
      images.set(record.id, { state: "ready", bitmap, uses: {} })
      notify()
    }).catch((error: unknown) => {
      if (wanted()) images.set(record.id, { state: "failed" })
      // The plain-browser dev build has no backend: no maps are expected there.
      console.warn(`Texture ${record.id.slice(0, 12)}… not loaded, drawing without it:`, error)
    })
  },
}
