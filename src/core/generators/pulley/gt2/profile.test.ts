import { describe, expect, it } from "vitest"
import { signedArea2 } from "../../mesh/outline"
import { isSimple } from "../../testing/polygon"
import { GT2_PLD, gt2Outline, gt2PitchDiameter } from "./profile"

describe("GT2 pulley profile", () => {
  it("has the pitch diameter z p / π (PLAN §2: 20 teeth → 12.73 mm)", () => {
    expect(gt2PitchDiameter(20)).toBeCloseTo(12.732, 3)
    expect(gt2PitchDiameter(16)).toBeCloseTo(10.186, 3)
  })

  it.each([10, 16, 20, 36, 60])("z = %i: tips on d_p − 2 PLD, grooves 0.75 deep, simple", (z) => {
    const points = gt2Outline(z)
    const radii = points.map(([u, v]) => Math.hypot(u, v))
    const tip = gt2PitchDiameter(z) / 2 - GT2_PLD
    expect(Math.max(...radii)).toBeCloseTo(tip, 9)
    expect(Math.min(...radii)).toBeCloseTo(tip - 0.75, 2)
    expect(signedArea2(points)).toBeGreaterThan(0)
    expect(isSimple(points)).toBe(true)
  })
})
