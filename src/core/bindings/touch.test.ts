import { describe, expect, it } from "vitest"
import { obbsTouch } from "./touch"

// Contact outside test mode (PLAN 13.1): oriented boxes by separating axes, within a gap.

const box = (centre: [number, number, number], half: [number, number, number], turn = 0) => {
  const [c, s] = [Math.cos(turn), Math.sin(turn)]
  return {
    centre,
    half,
    axes: [
      [c, s, 0],
      [-s, c, 0],
      [0, 0, 1],
    ] as [[number, number, number], [number, number, number], [number, number, number]],
  }
}

describe("boxes touching", () => {
  it("face to face counts within the gap, not beyond", () => {
    const a = box([0, 0, 0], [10, 10, 10])
    expect(obbsTouch(a, box([20, 0, 0], [10, 10, 10]), 0.5)).toBe(true) // flush
    expect(obbsTouch(a, box([20.4, 0, 0], [10, 10, 10]), 0.5)).toBe(true)
    expect(obbsTouch(a, box([20.6, 0, 0], [10, 10, 10]), 0.5)).toBe(false)
  })

  it("a turned box's corner near a face is seen by the right axis", () => {
    const a = box([0, 0, 0], [10, 10, 10])
    // A cube turned 45° about z: its corner reaches 10·√2 ≈ 14.14 from its centre.
    expect(obbsTouch(a, box([24, 0, 0], [10, 10, 10], Math.PI / 4), 0.5)).toBe(true)
    expect(obbsTouch(a, box([25, 0, 0], [10, 10, 10], Math.PI / 4), 0.5)).toBe(false)
  })
})
