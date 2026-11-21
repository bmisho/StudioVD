// When to solve again (PLAN 12.8): edits settle for a moment first (debounced), drags update
// at 30 Hz (throttled), and never more than one solve is in flight.

export interface SchedulerOptions {
  debounceMs: number
  throttleMs: number
  /** Starts a solve; call `done` when its answer is in. */
  run: (done: () => void) => void
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface Scheduler {
  /** Something changed; `live` while a gesture (drag, scrub) is going on. */
  changed: (live: boolean) => void
  dispose: () => void
}

export function createScheduler(o: SchedulerOptions): Scheduler {
  const now = o.now ?? (() => performance.now())
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  let timer: unknown = null
  let busy = false
  let dirty = false
  let lastStart = -Infinity
  let disposed = false

  const arm = (ms: number) => {
    if (timer !== null) clearTimer(timer)
    timer = setTimer(start, ms)
  }
  function start() {
    timer = null
    if (disposed) return
    if (busy) {
      dirty = true
      return
    }
    busy = true
    dirty = false
    lastStart = now()
    o.run(() => {
      busy = false
      // Changes that came in meanwhile get their own solve, at the drag rate.
      if (dirty && !disposed) arm(Math.max(0, o.throttleMs - (now() - lastStart)))
    })
  }
  return {
    changed: (live) => {
      if (busy) {
        dirty = true
        return
      }
      if (live) {
        // Throttle: keep a pending solve, else start one as soon as the rate allows.
        if (timer === null) arm(Math.max(0, o.throttleMs - (now() - lastStart)))
      } else arm(o.debounceMs)
    },
    dispose: () => {
      disposed = true
      if (timer !== null) clearTimer(timer)
    },
  }
}
