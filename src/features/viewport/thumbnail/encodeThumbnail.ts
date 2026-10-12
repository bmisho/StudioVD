/** Thumbnail size in the bundle (16:10). */
export const THUMBNAIL_WIDTH = 512
export const THUMBNAIL_HEIGHT = 320

/**
 * WebGL pixels (bottom-up rows, premultiplied alpha) → top-down, straight-alpha RGBA, as
 * ImageData expects.
 */
export function toImagePixels(
  px: Uint8Array,
  w: number,
  h: number
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(w * h * 4)
  const row = w * 4
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * row
    for (let x = 0; x < row; x += 4) {
      const a = px[src + x + 3] ?? 0
      const scale = a === 0 ? 0 : 255 / a
      out[y * row + x] = (px[src + x] ?? 0) * scale
      out[y * row + x + 1] = (px[src + x + 1] ?? 0) * scale
      out[y * row + x + 2] = (px[src + x + 2] ?? 0) * scale
      out[y * row + x + 3] = a
    }
  }
  return out
}

/** The centred 16:10 crop of a `w`×`h` frame. */
export function cropToAspect(w: number, h: number) {
  const aspect = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT
  const cw = Math.min(w, Math.round(h * aspect))
  const ch = Math.min(h, Math.round(w / aspect))
  return { x: Math.floor((w - cw) / 2), y: Math.floor((h - ch) / 2), w: cw, h: ch }
}

/** Scales the crop into a 512×320 PNG over `background` (the viewport colour). */
export async function encodeThumbnail(
  pixels: Uint8ClampedArray<ArrayBuffer>,
  w: number,
  h: number,
  background: string
): Promise<Uint8Array | null> {
  const frame = document.createElement("canvas")
  frame.width = w
  frame.height = h
  const out = document.createElement("canvas")
  out.width = THUMBNAIL_WIDTH
  out.height = THUMBNAIL_HEIGHT
  const frameCtx = frame.getContext("2d")
  const ctx = out.getContext("2d")
  if (!frameCtx || !ctx) return null
  frameCtx.putImageData(new ImageData(pixels, w, h), 0, 0)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
  ctx.imageSmoothingQuality = "high"
  const crop = cropToAspect(w, h)
  ctx.drawImage(frame, crop.x, crop.y, crop.w, crop.h, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"))
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null
}
