import { MeshBasicMaterial } from "three"
import { describe, expect, it } from "vitest"
import { acquireStencilBit, applyStencilBit, releaseStencilBit } from "./stencilBits"

describe("stencil bits", () => {
  it("hands each highlighted part its own bit, then shares the least used", () => {
    const bits = Array.from({ length: 8 }, () => acquireStencilBit())
    expect(bits).toEqual([1, 2, 4, 8, 16, 32, 64, 128])
    const ninth = acquireStencilBit()
    expect(ninth).toBe(1)
    releaseStencilBit(4)
    expect(acquireStencilBit()).toBe(4) // the freed bit is the least used again
    for (const bit of [...bits, ninth]) releaseStencilBit(bit)
    expect(acquireStencilBit()).toBe(1)
    releaseStencilBit(1)
  })

  it("points a shared material at one bit for the next draw", () => {
    const material = new MeshBasicMaterial()
    applyStencilBit(material, 8)
    expect(material).toMatchObject({ stencilRef: 8, stencilWriteMask: 8, stencilFuncMask: 8 })
  })
})
