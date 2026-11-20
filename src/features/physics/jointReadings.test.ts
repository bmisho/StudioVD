import { describe, expect, it, vi } from "vitest"
import type { MateId } from "@/core/schema"
import { READING_NOTIFY_MS, createJointReadings } from "./jointReadings"

describe("joint readings (PLAN 10.8)", () => {
  it("keeps every write, tells readers at most every READING_NOTIFY_MS", () => {
    let t = 0
    const readings = createJointReadings(() => t)
    const heard = vi.fn()
    readings.subscribe(heard)
    const id = "m" as MateId
    for (let step = 0; step < 24; step++) {
      t = step * (1000 / 120) // 120 steps a second
      readings.write(id, step)
      readings.publish()
    }
    expect(readings.get(id)).toBe(23) // the latest, always
    // 24 steps span 192 ms: told at 0, ≥ 100 and (not yet) ≥ 200.
    expect(heard).toHaveBeenCalledTimes(Math.floor((23 * (1000 / 120)) / READING_NOTIFY_MS) + 1)
    const before = readings.version()
    readings.clear()
    expect(readings.get(id)).toBeUndefined()
    expect(readings.version()).toBe(before + 1)
  })
})
