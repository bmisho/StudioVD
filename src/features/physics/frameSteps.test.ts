import { describe, expect, it, vi } from "vitest"
import { stepFrame } from "./frameSteps"
import { MAX_STEPS_PER_FRAME, TIME_STEP_S } from "./physicsConfig"

describe("stepFrame (security review)", () => {
  it("passes a frame's time on, at most MAX_STEPS_PER_FRAME steps of it", () => {
    const step = vi.fn()
    expect(stepFrame(step, 1 / 60)).toBeNull()
    expect(stepFrame(step, 0.5)).toBeNull() // a long frame (a slow world): no spiral
    expect(step.mock.calls).toEqual([[1 / 60], [MAX_STEPS_PER_FRAME * TIME_STEP_S]])
  })

  it("returns what a step threw (a WASM trap) instead of throwing in the render loop", () => {
    const trap = new WebAssembly.RuntimeError("unreachable")
    expect(
      stepFrame(() => {
        throw trap
      }, 1 / 60)
    ).toBe(trap)
  })
})
