// @vitest-environment node
import { describe, expect, it } from "vitest"
import { cutTile, tileLayout, tileOrigin } from "./materialPreviews"

describe("material preview tiles", () => {
  it("fits whole tiles into the drawing buffer, or none", () => {
    expect(tileLayout(500, 250, 96)).toEqual({ columns: 5, perBatch: 10 })
    expect(tileLayout(95, 400, 96)).toBeNull()
    expect([0, 4, 5, 9].map((i) => tileOrigin(i, 5, 96))).toEqual([
      { x: 0, y: 0 },
      { x: 384, y: 0 },
      { x: 0, y: 96 },
      { x: 384, y: 96 },
    ])
  })

  it("cuts one tile out of a read block, top row first, alpha straight", () => {
    // A 4 x 2 block (GL rows bottom-up) holding two 2 x 2 tiles; pixel value = x + 10 y.
    const block = new Uint8Array(4 * 2 * 4)
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 4; x++) block.set([x + 10 * y, 0, 0, 255], (y * 4 + x) * 4)
    const tile = cutTile(block, 4, 2, 2, 0) // the right-hand tile
    const reds = Array.from({ length: 4 }, (_, i) => tile[4 * i])
    expect(reds).toEqual([12, 13, 2, 3]) // flipped: GL row 1 is the image's top row
  })
})
