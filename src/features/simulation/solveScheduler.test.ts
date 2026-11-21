import { describe, expect, it } from "vitest"
import { createScheduler } from "./solveScheduler"

/** A clock and timers the test advances by hand. */
function fakeTime() {
  let t = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  let next = 1
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => {
      timers.set(next, { at: t + ms, fn })
      return next++
    },
    clearTimer: (h: unknown) => timers.delete(h as number),
    advance(ms: number) {
      const end = t + ms
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, v]) => v.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0])
        t = due[1].at
        due[1].fn()
      }
      t = end
    },
  }
}

describe("solve scheduling (PLAN 12.8)", () => {
  it("debounces edits: a burst solves once, after it settles", () => {
    const time = fakeTime()
    const runs: number[] = []
    const s = createScheduler({
      debounceMs: 150,
      throttleMs: 33,
      ...time,
      run: (done) => (runs.push(time.now()), done()),
    })
    for (let i = 0; i < 5; i++) {
      s.changed(false)
      time.advance(50)
    }
    time.advance(500)
    expect(runs).toEqual([350])
  })

  it("throttles a drag to about 30 solves a second", () => {
    const time = fakeTime()
    let runs = 0
    const s = createScheduler({
      debounceMs: 150,
      throttleMs: 33,
      ...time,
      run: (done) => (runs++, done()),
    })
    for (let i = 0; i < 100; i++) {
      s.changed(true)
      time.advance(10) // 100 pointer moves over one second
    }
    expect(runs).toBeGreaterThanOrEqual(28)
    expect(runs).toBeLessThanOrEqual(31)
  })

  it("keeps one solve in flight and solves again once it is back", () => {
    const time = fakeTime()
    let pending: (() => void) | null = null
    let runs = 0
    const s = createScheduler({
      debounceMs: 10,
      throttleMs: 33,
      ...time,
      run: (done) => (runs++, (pending = done)),
    })
    s.changed(false)
    time.advance(20)
    expect(runs).toBe(1)
    s.changed(false) // while busy
    time.advance(100)
    expect(runs).toBe(1)
    const finish = pending as (() => void) | null
    finish?.()
    time.advance(100)
    expect(runs).toBe(2)
  })
})
