import { MAX_STEPS_PER_FRAME, TIME_STEP_S } from "./physicsConfig"

/**
 * Advances test mode's world by one frame's time, at most MAX_STEPS_PER_FRAME fixed steps
 * (`step` keeps the remainder for the next frame). Returns what a step threw, if anything:
 * Rapier's WASM can trap (`unreachable`), and the world is not to be stepped again after.
 */
export function stepFrame(step: (seconds: number) => void, frameSeconds: number): unknown {
  try {
    step(Math.min(frameSeconds, MAX_STEPS_PER_FRAME * TIME_STEP_S))
    return null
  } catch (error) {
    return error ?? new Error("physics step failed")
  }
}
