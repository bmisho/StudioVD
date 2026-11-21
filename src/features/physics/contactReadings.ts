import type { PartId } from "@/core/schema"

// Contacts between parts during test mode (PLAN 13.1): only the pairs bindings watch are read
// after each physics step. Transient per-frame state (CLAUDE.md §4 kind 3), never Zustand.

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function createContactReadings() {
  const watched = new Map<string, readonly [PartId, PartId]>()
  const touching = new Set<string>()
  let running = false
  return {
    /** The pairs bindings ask about (replaces the last list). */
    watch: (pairs: readonly (readonly [PartId, PartId])[]): void => {
      watched.clear()
      for (const [a, b] of pairs) watched.set(key(a, b), [a, b])
    },
    pairs: (): (readonly [PartId, PartId])[] => [...watched.values()],
    /** After a step: whether a watched pair touches now. */
    write: (a: PartId, b: PartId, on: boolean): void => {
      running = true
      if (on) touching.add(key(a, b))
      else touching.delete(key(a, b))
    },
    /** Whether the physics has an answer for this pair (test mode running and watched). */
    known: (a: PartId, b: PartId): boolean => running && watched.has(key(a, b)),
    touching: (a: PartId, b: PartId): boolean => touching.has(key(a, b)),
    /** The run ended. */
    clear: (): void => {
      running = false
      touching.clear()
    },
  }
}

export const contactReadings = createContactReadings()
