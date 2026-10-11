import type { RGB8 } from "@/core/math/colorGradient"
import type { PixelSummary } from "./probeTypes"

/**
 * Summarises a bottom-up RGBA buffer (readPixels order) against the expected vertical
 * background gradient, so tests can tell "something was drawn" from "only background".
 */
export function summarizePixels(
  rgba: Uint8Array,
  width: number,
  height: number,
  background: { top: RGB8; bottom: RGB8 },
  tolerance = 6
): PixelSummary {
  const colours = new Set<number>()
  let different = 0
  for (let y = 0; y < height; y++) {
    const t = height === 1 ? 1 : y / (height - 1)
    const expected = [0, 1, 2].map(
      (c) =>
        (background.bottom[c] ?? 0) + ((background.top[c] ?? 0) - (background.bottom[c] ?? 0)) * t
    )
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = rgba[i] ?? 0
      const g = rgba[i + 1] ?? 0
      const b = rgba[i + 2] ?? 0
      colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3))
      const delta = Math.max(
        Math.abs(r - (expected[0] ?? 0)),
        Math.abs(g - (expected[1] ?? 0)),
        Math.abs(b - (expected[2] ?? 0))
      )
      if (delta > tolerance) different++
    }
  }
  const top = (height - 1) * width * 4
  return {
    width,
    height,
    topLeft: [rgba[top] ?? 0, rgba[top + 1] ?? 0, rgba[top + 2] ?? 0, rgba[top + 3] ?? 0],
    distinctColours: colours.size,
    nonBackgroundFraction: width * height === 0 ? 0 : different / (width * height),
  }
}

/** Pixels whose RGB is within `tolerance` (per channel) of `colour`. */
export function countColour(rgba: Uint8Array, colour: RGB8, tolerance = 2): number {
  let n = 0
  for (let i = 0; i < rgba.length; i += 4) {
    if (
      Math.abs((rgba[i] ?? 0) - colour[0]) <= tolerance &&
      Math.abs((rgba[i + 1] ?? 0) - colour[1]) <= tolerance &&
      Math.abs((rgba[i + 2] ?? 0) - colour[2]) <= tolerance
    )
      n++
  }
  return n
}
