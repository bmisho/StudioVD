import { describe, expect, it } from "vitest"
import { verticalGradientRGBA } from "./colorGradient"

const top = [248, 250, 252] as const // --viewport-top (slate-50)
const bottom = [226, 232, 240] as const // --viewport-bottom (slate-200)

describe("verticalGradientRGBA", () => {
  it("runs from the bottom colour in row 0 to the top colour in the last row", () => {
    const px = verticalGradientRGBA(top, bottom, 256)
    expect(px).toHaveLength(1024)
    expect(Array.from(px.slice(0, 4))).toEqual([226, 232, 240, 255])
    expect(Array.from(px.slice(1020))).toEqual([248, 250, 252, 255])
  })

  it("changes every channel monotonically", () => {
    const px = verticalGradientRGBA(top, bottom, 256)
    for (let row = 1; row < 256; row++) {
      for (let c = 0; c < 3; c++) {
        expect(px[row * 4 + c] ?? 0).toBeGreaterThanOrEqual(px[(row - 1) * 4 + c] ?? 0)
      }
    }
  })

  it("returns the top colour for a single row", () => {
    expect(Array.from(verticalGradientRGBA(top, bottom, 1))).toEqual([248, 250, 252, 255])
  })
})
