import type { SelectionItem } from "@/store/session/sessionStore"

/**
 * Viewport pre-highlight (hover). Transient UI state (CLAUDE.md §4 kind 3): NOT Zustand, not
 * persisted, not undoable. A tiny observable so the few components whose answer changes can
 * re-render through useSyncExternalStore; R3F then invalidates the demand frameloop itself.
 * Same item shape as the selection, so the scene tree can hover-link later.
 */
export type HoverTarget = Pick<SelectionItem, "kind" | "id">

export interface HoverStore {
  get: () => HoverTarget | null
  /** Sets the hovered item; a no-op (no notification) when it is unchanged. */
  set: (target: HoverTarget | null) => void
  /** Clears only if `target` is the hovered item (pointer-out of a part that lost hover). */
  clearIf: (target: HoverTarget) => void
  subscribe: (listener: () => void) => () => void
}

export const sameTarget = (a: HoverTarget | null, b: HoverTarget | null) =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id)

export function createHoverStore(): HoverStore {
  let current: HoverTarget | null = null
  const listeners = new Set<() => void>()
  const set = (target: HoverTarget | null) => {
    if (sameTarget(current, target)) return
    current = target
    for (const listener of listeners) listener()
  }
  return {
    get: () => current,
    set,
    clearIf: (target) => {
      if (sameTarget(current, target)) set(null)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** The app-wide viewport hover. Tests create their own with `createHoverStore()`. */
export const viewportHover = createHoverStore()
