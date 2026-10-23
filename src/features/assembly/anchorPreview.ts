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
function createAnchorPreview() {
  let current: AnchorPreview | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (next: AnchorPreview | null) => {
      if (next === current) return
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
