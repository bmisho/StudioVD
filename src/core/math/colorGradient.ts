export type RGB8 = readonly [number, number, number]

/**
 * RGBA rows for a vertical gradient texture, interpolated in sRGB like a CSS gradient.
 * Row 0 is the bottom (texture v = 0), the last row is the top; alpha is opaque.
 */
export function verticalGradientRGBA(top: RGB8, bottom: RGB8, rows: number): Uint8Array {
  const out = new Uint8Array(rows * 4)
  for (let row = 0; row < rows; row++) {
    const t = rows === 1 ? 1 : row / (rows - 1)
    for (let c = 0; c < 3; c++) {
      out[row * 4 + c] = Math.round((bottom[c] ?? 0) + ((top[c] ?? 0) - (bottom[c] ?? 0)) * t)
    }
    out[row * 4 + 3] = 255
  }
  return out
}
