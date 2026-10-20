/**
 * Longest side a texture is drawn at. Rust admits images up to 8192 px a side: at 2048 an
 * RGBA8 texture with its mipmaps holds ~22 MB of GPU memory instead of ~360 MB, and it is
 * within every WebGL2 device's MAX_TEXTURE_SIZE (at least 2048), so three never redraws it
 * into a canvas (r186 WebGLTextures.resizeImage, which uploads without setting the flip).
 */
export const MAX_TEXTURE_SIDE_PX = 2048

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
export async function decodeTexture(blob: Blob): Promise<ImageBitmap> {
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

let tail: Promise<unknown> = Promise.resolve()

/**
 * Runs jobs one after another. A full-size decode of an 8192 px image holds 256 MB until it
 * is resampled; a project opening with many maps would otherwise hold them all at once.
 */
export function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job)
  tail = run.catch(() => undefined)
  return run
}
