import { describe, expect, it } from "vitest"
import { verticalGradientRGBA } from "@/core/math/colorGradient"
import { countColour, summarizePixels } from "./pixelStats"

const top = [248, 250, 252] as const
const bottom = [226, 232, 240] as const

function gradientBuffer(width: number, height: number): Uint8Array {
  const column = verticalGradientRGBA(top, bottom, height)
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) out.set(column.subarray(y * 4, y * 4 + 4), (y * width + x) * 4)
  return out
}

describe("summarizePixels", () => {
  it("sees only background in a pure gradient", () => {
    const s = summarizePixels(gradientBuffer(100, 50), 100, 50, { top, bottom })
    expect(s.nonBackgroundFraction).toBe(0)
    expect(s.topLeft).toEqual([248, 250, 252, 255]) // last row of a bottom-up buffer
  })

  it("counts drawn pixels", () => {
    const px = gradientBuffer(100, 50)
    for (let y = 10; y < 20; y++)
      for (let x = 10; x < 20; x++) px.set([14, 165, 233, 255], (y * 100 + x) * 4)
    const s = summarizePixels(px, 100, 50, { top, bottom })
    expect(s.nonBackgroundFraction).toBeCloseTo(100 / 5000, 12)
    expect(s.distinctColours).toBeGreaterThan(1)
  })

  it("ignores ±1 dithering", () => {
    const px = gradientBuffer(10, 10)
    px[0] = (px[0] ?? 0) + 1
    expect(summarizePixels(px, 10, 10, { top, bottom }).nonBackgroundFraction).toBe(0)
  })
})

describe("countColour", () => {
  it("counts pixels within the tolerance of a colour", () => {
    const px = new Uint8Array([
      14, 165, 233, 255, 16, 167, 235, 255, 20, 165, 233, 255, 0, 0, 0, 255,
    ])
    expect(countColour(px, [14, 165, 233])).toBe(2)
    expect(countColour(px, [14, 165, 233], 6)).toBe(3)
  })
})
