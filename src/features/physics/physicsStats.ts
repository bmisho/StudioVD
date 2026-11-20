/** How often the overlay hears new figures (ms). */
const NOTIFY_MS = 250

/**
 * Test mode's cost, for the dev perf overlay (PLAN 10.9): physics time per frame, averaged
 * between notifications. Transient (CLAUDE.md §4 kind 3), written by `PhysicsStepper`.
 */
export function createPhysicsStats(now: () => number = () => performance.now()) {
  let [frames, totalMs, worstMs] = [0, 0, 0]
  let shown = { avgMs: 0, worstMs: 0, fps: 0 }
  let since = now()
  const listeners = new Set<() => void>()
  return {
    record: (ms: number): void => {
      frames++
      totalMs += ms
      worstMs = Math.max(worstMs, ms)
      const t = now()
      if (t - since < NOTIFY_MS) return
      shown = { avgMs: totalMs / frames, worstMs, fps: (1000 * frames) / (t - since) }
      ;[frames, totalMs, worstMs, since] = [0, 0, 0, t]
      for (const l of listeners) l()
    },
    get: () => shown,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export const physicsStats = createPhysicsStats()
