import { Color, Vector2, type WebGLRenderer } from "three"
import { describe, expect, it } from "vitest"
import { HullOutlineMaterial } from "./hullOutlineMaterial"

describe("hull outline material", () => {
  it("keeps its width in CSS px at any pixel ratio", () => {
    const material = new HullOutlineMaterial(new Color(0x0ea5e9), 3)
    const renderer = {
      getDrawingBufferSize: (target: Vector2) => target.set(1800, 1000),
      getPixelRatio: () => 2,
    } as unknown as WebGLRenderer
    material.sync(renderer)
    expect(material.uniforms.thicknessPx?.value).toBe(6)
    expect(material.uniforms.bufferSize?.value).toEqual(new Vector2(1800, 1000))
  })
})
