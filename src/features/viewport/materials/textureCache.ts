import { NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture } from "three"
import type { TextureId } from "@/core/schema"
import { textureUrl } from "@/lib/tauri/files"

/** How a map's texels are read: colour (sRGB, decoded to linear by the GPU) or raw data. */
export type TextureKind = "color" | "data"

/**
 * Longest side a texture is drawn at. Rust admits images up to 8192 px a side: at 2048 an
 * RGBA8 texture with its mipmaps holds ~22 MB of GPU memory instead of ~360 MB, and it is
 * within every WebGL2 device's MAX_TEXTURE_SIZE (at least 2048), so three never redraws it
 * into a canvas (r186 WebGLTextures.resizeImage, which uploads without setting the flip).
 */
export const MAX_TEXTURE_SIDE_PX = 2048

type Entry = { id: string } & (
  | { state: "loading" }
  | { state: "ready"; texture: Texture; bitmap: ImageBitmap }
  | { state: "failed" }
)

/** By `kind:id`: a colour and a data use of one image are two textures (two colour spaces). */
const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
const keyOf = (id: string, kind: TextureKind) => `${kind}:${id}`

// Upright like three's default `flipY` (image bottom row at v = 0), but flipped at decode:
// three skips the unpack flags for an ImageBitmap (r186 WebGLTextures). The pixels arrive as
// stored: no alpha premultiply and no colour profile conversion (a roughness map is data).
const DECODE: ImageBitmapOptions = {
  imageOrientation: "flipY",
  premultiplyAlpha: "none",
  colorSpaceConversion: "none",
}

/**
 * Decodes the file once at its own size, then resamples the decoded bitmap when it is larger
 * than MAX_TEXTURE_SIDE_PX. The size is not known before decoding (the document stores none),
 * and reading it from the PNG/JPEG headers here would duplicate Rust's parser; the common case,
 * an image within the limit, takes a single step.
 */
async function decode(blob: Blob): Promise<ImageBitmap> {
  const full = await createImageBitmap(blob, DECODE)
  const scale = MAX_TEXTURE_SIDE_PX / Math.max(full.width, full.height)
  if (scale >= 1) return full
  try {
    // An ImageBitmap source is not flipped again: its orientation is left as it is.
    return await createImageBitmap(full, {
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
      resizeWidth: Math.max(1, Math.round(full.width * scale)),
      resizeHeight: Math.max(1, Math.round(full.height * scale)),
      resizeQuality: "high",
    })
  } finally {
    full.close()
  }
}

async function load(
  record: { id: TextureId; path: string },
  kind: TextureKind
): Promise<{ texture: Texture; bitmap: ImageBitmap }> {
  const ext = /\.(png|jpg)$/.exec(record.path)?.[1]
  if (!ext) throw new Error(`unexpected texture path ${record.path}`)
  const response = await fetch(textureUrl(record.id, ext))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const bitmap = await decode(await response.blob())
  const texture = new Texture(bitmap)
  texture.flipY = false // flipped at decode (three would ignore it for a bitmap anyway)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = kind === "color" ? SRGBColorSpace : NoColorSpace
  texture.needsUpdate = true
  return { texture, bitmap }
}

/**
 * Material texture images by content address and use (PLAN 6.3), like the asset cache: loaded
 * once from the `stvd` scheme, kept while the open document lists them, released when
 * another document replaces it (`retain`). A missing or broken image draws the material
 * without that map (and is logged).
 */
export const textureCache = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  get: (id: TextureId, kind: TextureKind): Texture | undefined => {
    const entry = entries.get(keyOf(id, kind))
    return entry?.state === "ready" ? entry.texture : undefined
  },
  /**
   * A new document replaced the open one (New, Open): frees textures it does not list, and
   * forgets failed loads, since its workspace may hold the files an earlier one lacked.
   * Loads in flight are kept (until the next call). Subscribers hear of a freed texture, so
   * no material keeps drawing it.
   */
  retain: (ids: ReadonlySet<string>): void => {
    let freed = false
    for (const [key, entry] of entries) {
      if (entry.state === "loading" || (entry.state === "ready" && ids.has(entry.id))) continue
      if (entry.state === "ready") {
        entry.texture.dispose()
        entry.bitmap.close()
        freed = true
      }
      entries.delete(key)
    }
    if (freed) notify()
  },
  /** Starts loading `record` for `kind` once (a failure is not retried until `retain`). */
  request: (record: { id: TextureId; path: string }, kind: TextureKind): void => {
    const key = keyOf(record.id, kind)
    if (entries.has(key)) return
    entries.set(key, { id: record.id, state: "loading" })
    load(record, kind).then(
      ({ texture, bitmap }) => {
        entries.set(key, { id: record.id, state: "ready", texture, bitmap })
        notify()
      },
      (error: unknown) => {
        entries.set(key, { id: record.id, state: "failed" })
        // The plain-browser dev build has no backend: no maps are expected there.
        console.warn(`Texture ${record.id.slice(0, 12)}… not loaded, drawing without it:`, error)
      }
    )
  },
}
