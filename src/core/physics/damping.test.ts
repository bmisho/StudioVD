import { describe, expect, it } from "vitest"
import { DAMPING_RATE_PER_S, dampingForce, dampingTorque } from "./damping"
import { quatFromAxisAngle } from "@/core/math/vec3"

describe("damping", () => {
  it("opposes linear velocity in proportion to mass", () => {
    expect(dampingForce(2, [1, -2, 0], 10)).toEqual([-20, 40, -0])
  })

  it("uses the full inertia tensor: τ = −d·I·ω for a rotated body", () => {
    // Principal inertias (1, 4, 9) with the principal frame turned 90° about Z:
    // world X is local -Y (I = 4), world Y is local X (I = 1).
    const q = quatFromAxisAngle([0, 0, 1], Math.PI / 2)
    const t = dampingTorque([1, 4, 9], q, [1, 0, 0], 1)
    expect(t[0]).toBeCloseTo(-4, 12)
    expect(t[1]).toBeCloseTo(0, 12)
    const u = dampingTorque([1, 4, 9], q, [0, 2, 0], 1)
    expect(u[1]).toBeCloseTo(-2, 12)
  })

  it("is explicit-stable at the app's step", () => {
    expect(DAMPING_RATE_PER_S / 120).toBeLessThan(2)
  })
})
