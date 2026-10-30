import type { Pose } from "@/core/schema"
import type { ReadyComponent } from "./prepareInsertion"

/** An insertion drag in progress (PLAN 9.5): what the DOM chip and the 3D ghost show. */
export interface InsertionPreview {
  label: string
  /** The cursor, client px (the DOM chip follows it). */
  pointer: { x: number; y: number }
  /** Prepared component, once its geometry is in the workspace. */
  ready: ReadyComponent | null
  /** Where the component frame would go; null off the 3D view or while preparing. */
  pose: Pose | null
  /** Snapped onto this anchor (its tag), when it is. */
  snap: string | null
}

/**
 * Transient UI state (CLAUDE.md §4 kind 3), like the viewport hover: a tiny observable, not
 * Zustand. Null when no drag is in progress.
 */
function createInsertionPreview() {
  let current: InsertionPreview | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (next: InsertionPreview | null) => {
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

export const insertionPreview = createInsertionPreview()
export type InsertionPreviewStore = ReturnType<typeof createInsertionPreview>
