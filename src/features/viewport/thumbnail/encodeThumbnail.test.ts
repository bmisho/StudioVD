import { describe, expect, it } from "vitest"
import { cropToAspect, toImagePixels } from "./encodeThumbnail"

describe("thumbnail pixels", () => {
  it("flips rows and undoes premultiplied alpha", () => {
    // 1×2 image: bottom row opaque red, top row half-transparent premultiplied green.
    const gl = new Uint8Array([255, 0, 0, 255, 0, 64, 0, 128])
    expect(Array.from(toImagePixels(gl, 1, 2))).toEqual([0, 128, 0, 128, 255, 0, 0, 255])
  })

  it("crops the centre to 16:10", () => {
    expect(cropToAspect(1600, 1000)).toEqual({ x: 0, y: 0, w: 1600, h: 1000 })
    expect(cropToAspect(2000, 1000)).toEqual({ x: 200, y: 0, w: 1600, h: 1000 })
    expect(cropToAspect(800, 1000)).toEqual({ x: 0, y: 250, w: 800, h: 500 })
  })
})
