import { describe, expect, it } from "vitest"
import { switchFootswitch } from "./v1"

describe("footswitch generator", () => {
  it("has its plunger on a slide that presses 2.5 mm down (1.1, 0.2.2)", () => {
    const out = switchFootswitch.generate(switchFootswitch.defaults)
    expect(Object.keys(out.bodies)).toEqual(["switch", "plunger"])
    expect(out.bodies.plunger?.role).toBe("actuator")
    expect(out.mates.press).toMatchObject({
      type: "prismatic",
      anchorA: "guide",
      anchorB: "plungerAxis",
      limits: { min: -2.5, max: 0 },
    })
    // The slide runs along the bushing's axis (up), both anchors where the plunger leaves it.
    const [guide, axis] = [out.anchors.guide, out.anchors.plungerAxis]
    expect(guide?.body).toBe("switch")
    expect(axis?.body).toBe("plunger")
    expect(guide?.frame).toEqual(axis?.frame)
    expect(guide?.frame.z).toEqual([0, 1, 0])
    // Pressed all the way, the plunger still reaches into the bushing: no gap shows.
    const positions = out.bodies.plunger?.mesh.positions ?? new Float32Array()
    let lowest = Infinity
    for (let i = 1; i < positions.length; i += 3) lowest = Math.min(lowest, positions[i] ?? 0)
    expect(lowest + 2.5).toBeLessThan(switchFootswitch.defaults.bushingLengthMm as number)
  })
})
