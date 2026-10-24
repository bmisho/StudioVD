import type { AnchorCandidate } from "@/core/assembly/snapCandidates"
import type { PartId } from "@/core/schema"

export interface AnchorPreview {
  partId: PartId
  candidate: AnchorCandidate
}

/**
 * What the Place Anchor tool would place under the cursor (PLAN 7.2). Transient UI state
 * (CLAUDE.md §4 kind 3), like the viewport hover: a tiny observable, not Zustand.
 */
/** Candidates are small trees of numbers and strings: equal when their JSON is. */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function createAnchorPreview() {
  let current: AnchorPreview | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (next: AnchorPreview | null) => {
      if (next === current) return
      if (next && current && next.partId === current.partId) {
        // Pointer moves mostly find the same snap again: nothing to redraw then.
        if (same(next.candidate, current.candidate)) return
        // The same edge or circle with a new frame: keep its object, so its line stays.
        const { feature } = current.candidate
        if (same(next.candidate.feature, feature))
          next = { ...next, candidate: { ...next.candidate, feature } }
      }
      current = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export const anchorPreview = createAnchorPreview()
