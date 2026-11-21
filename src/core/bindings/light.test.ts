import { describe, expect, it } from "vitest"
import { lightFactor } from "./light"

// The illuminance formula (PLAN §2, 13.6): E = I·cos θ / d² inside the beam.

describe("light between parts", () => {
  const emitter = {
    originMm: [0, 0, 0] as [number, number, number],
    z: [1, 0, 0] as [number, number, number],
  }

  it("on axis, facing: 1/d² (an inverse-square law)", () => {
    const at = (m: number) => ({
      originMm: [m * 1000, 0, 0] as [number, number, number],
      z: [-1, 0, 0] as [number, number, number],
    })
    expect(lightFactor(emitter, at(1), 0.5)).toBeCloseTo(1, 12)
    expect(lightFactor(emitter, at(2), 0.5)).toBeCloseTo(0.25, 12)
  })

  it("a tilted sensor gets cos θ of it", () => {
    const tilt = Math.PI / 3
    const sensor = {
      originMm: [1000, 0, 0] as [number, number, number],
      z: [-Math.cos(tilt), Math.sin(tilt), 0] as [number, number, number],
    }
    expect(lightFactor(emitter, sensor, 0.5)).toBeCloseTo(0.5, 12)
  })

  it("nothing outside the beam, behind the sensor, or at no distance", () => {
    const off = {
      originMm: [1000, 1000, 0] as [number, number, number],
      z: [-1, 0, 0] as [number, number, number],
    }
    expect(lightFactor(emitter, off, 0.5)).toBe(0) // 45° off axis, beam ±0.5 rad
    const back = {
      originMm: [1000, 0, 0] as [number, number, number],
      z: [1, 0, 0] as [number, number, number],
    }
    expect(lightFactor(emitter, back, 0.5)).toBe(0)
    expect(lightFactor(emitter, { originMm: [0, 0, 0], z: [-1, 0, 0] }, 0.5)).toBe(0)
  })
})
