import type { MateId } from "@/core/schema"

/** How often readers hear about new readings (ms): the physics writes every step. */
export const READING_NOTIFY_MS = 100

/**
 * Live joint coordinates during test mode (PLAN 10.4, 10.8): each mate's angle (rad) or slide
 * (mm) from where it was snapped, written after every physics step. Transient per-frame state
 * (CLAUDE.md §4 kind 3): a plain map, never Zustand. Phase 13 bindings sample it with `get`;
 * views subscribe and hear at most every READING_NOTIFY_MS.
 */
export function createJointReadings(now: () => number = () => performance.now()) {
  const values = new Map<MateId, number>()
  const listeners = new Set<() => void>()
  let version = 0
  let lastNotify = -Infinity
  const notify = () => {
    version++
    lastNotify = now()
    for (const l of listeners) l()
  }
  return {
    get: (id: MateId): number | undefined => values.get(id),
    write: (id: MateId, value: number): void => void values.set(id, value),
    /** After a step's writes: tells readers, unless they heard less than READING_NOTIFY_MS ago. */
    publish: (): void => {
      if (now() - lastNotify >= READING_NOTIFY_MS) notify()
    },
    /** The run ended: no readings any more. */
    clear: (): void => {
      if (values.size === 0) return
      values.clear()
      notify()
    },
    /** Changes whenever readers were told something: a `useSyncExternalStore` snapshot. */
    version: (): number => version,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type JointReadings = ReturnType<typeof createJointReadings>

export const jointReadings = createJointReadings()
