import type { SceneDocument } from "@/core/schema"
import { HISTORY_LIMIT, useDocumentStore, type DocumentStore } from "./documentStore"

export interface History {
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  /** Drops all undo/redo entries (after New/Open). */
  clear: () => void
  /**
   * Starts a continuous gesture (drag, slider scrub, live rename). Changes made until
   * `endGesture` collapse into ONE undo entry (CLAUDE.md §4). Nested calls are ignored.
   */
  beginGesture: () => void
  /** Commits the gesture as a single undo entry, or nothing if the document did not change. */
  endGesture: () => void
  /** Aborts the gesture and restores the document as it was at `beginGesture`. */
  cancelGesture: () => void
  isInGesture: () => boolean
}

export function createHistory(store: DocumentStore): History {
  const temporal = store.temporal
  let gestureStart: SceneDocument | null = null

  return {
    undo: () => {
      if (gestureStart === null) temporal.getState().undo()
    },
    redo: () => {
      if (gestureStart === null) temporal.getState().redo()
    },
    canUndo: () => temporal.getState().pastStates.length > 0,
    canRedo: () => temporal.getState().futureStates.length > 0,
    clear: () => temporal.getState().clear(),

    beginGesture: () => {
      if (gestureStart !== null) return
      gestureStart = store.getState().doc
      temporal.getState().pause()
    },

    endGesture: () => {
      if (gestureStart === null) return
      const start = gestureStart
      gestureStart = null
      temporal.getState().resume()
      if (store.getState().doc === start) return
      // zundo has no public "push" API; its temporal store is a plain zustand store.
      temporal.setState((t) => ({
        pastStates: [...t.pastStates, { doc: start }].slice(-HISTORY_LIMIT),
        futureStates: [],
      }))
    },

    cancelGesture: () => {
      if (gestureStart === null) return
      const start = gestureStart
      gestureStart = null
      store.setState({ doc: start }) // still paused: not recorded
      temporal.getState().resume()
    },

    isInGesture: () => gestureStart !== null,
  }
}

/** History of the app-wide document store. */
export const documentHistory = createHistory(useDocumentStore)
