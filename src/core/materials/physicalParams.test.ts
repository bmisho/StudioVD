import { describe, expect, it } from "vitest"
import { Color } from "three"
import { testMaterial } from "@/core/schema/testing/sampleDocument"
import { linearToSrgbHex, physicalParams, srgbHexToLinear } from "./physicalParams"

describe("colour conversion", () => {
  it("matches three's colour management both ways", () => {
    for (const hex of ["#000000", "#ffffff", "#c0bebb", "#2f6b3e", "#0a0b0c"]) {
      const c = new Color(hex) // sRGB in, linear working space
      const linear = srgbHexToLinear(hex)
      expect(linear[0]).toBeCloseTo(c.r, 6)
      expect(linear[1]).toBeCloseTo(c.g, 6)
      expect(linear[2]).toBeCloseTo(c.b, 6)
      expect(linearToSrgbHex(linear)).toBe(hex)
      expect(linearToSrgbHex([c.r, c.g, c.b])).toBe(`#${c.getHexString()}`)
    }
  })

  it("rounds linear source colours to the nearest stored byte, clamped", () => {
    expect(linearToSrgbHex([0.21404, 0.21404, 0.21404])).toBe("#7f7f7f") // occt's sRGB 0.5 = 127.5/255
    expect(linearToSrgbHex([0.2158605, 0.2158605, 0.2158605])).toBe("#808080")
    expect(linearToSrgbHex([2, -1, 0.5])).toBe("#ff00bc")
  })
})

describe("physicalParams", () => {
  it("keeps glass opaque in three's sense, and sends dimmed parts to the sorted pass", () => {
    const glass = physicalParams(testMaterial("std.glass-soda-lime", 1))
    expect(glass).toMatchObject({
      transmission: 1,
      opacity: 1,
      transparent: false,
      depthWrite: true,
    })
    expect(glass.thickness).toBe(4)
    const tinted = physicalParams({ ...testMaterial("std.abs", 2), opacity: 0.4 })
    expect(tinted).toMatchObject({ opacity: 0.4, transparent: true, depthWrite: false })
    const glassDimmed = physicalParams({ ...testMaterial("std.pmma", 3), opacity: 0.4 })
    expect(glassDimmed).toMatchObject({ opacity: 1, transparent: false })
    const steel = physicalParams(testMaterial("std.steel", 4))
    expect(steel).toMatchObject({ metalness: 1, transparent: false, emissiveIntensity: 0 })
  })
})
