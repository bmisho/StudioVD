import type { SceneDocument } from "@/core/schema"
import { deepEqual } from "@/core/util/deepEqual"
import { HISTORY_LIMIT, useDocumentStore, type DocumentStore } from "./documentStore"

/** Proof of gesture ownership: only the code that began a gesture can end or cancel it. */
export type GestureToken = symbol

export interface History {
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  /**
   * Drops all undo/redo entries and abandons any open gesture (New/Open). Without the
   * abandon, a gesture open across a document swap would push the OLD document as an undo
   * entry and leave tracking paused.
   */
  clear: () => void
  /**
   * Starts a continuous gesture (drag, slider scrub, live rename). Changes until `endGesture`
   * collapse into ONE undo entry (CLAUDE.md §4). Returns null if another gesture is active.
   */
  beginGesture: () => GestureToken | null
  /** Commits the gesture as one undo entry, or nothing if the document ends up unchanged. */
  endGesture: (token: GestureToken | null) => void
  /** Aborts the gesture and restores the document as it was at `beginGesture`. */
  cancelGesture: (token: GestureToken | null) => void
  isInGesture: () => boolean
}

interface OpenGesture {
  token: GestureToken
  start: SceneDocument
}

export function createHistory(store: DocumentStore): History {
  const temporal = store.temporal
  let gesture: OpenGesture | null = null

  const close = (token: GestureToken | null): OpenGesture | null => {
    if (gesture === null || token === null || gesture.token !== token) return null
    const closed = gesture
    gesture = null
    temporal.getState().resume()
    return closed
  }

  return {
    undo: () => {
      if (gesture === null) temporal.getState().undo()
    },
    redo: () => {
      if (gesture === null) temporal.getState().redo()
    },
    canUndo: () => temporal.getState().pastStates.length > 0,
    canRedo: () => temporal.getState().futureStates.length > 0,

    clear: () => {
      gesture = null
      temporal.getState().resume()
      temporal.getState().clear()
    },

    beginGesture: () => {
      if (gesture !== null) return null
      gesture = { token: Symbol("gesture"), start: store.getState().doc }
      temporal.getState().pause()
      return gesture.token
    },

    endGesture: (token) => {
      if (gesture === null || token === null || gesture.token !== token) return
      // Structural, not reference, equality: typing a name and then retyping the original
      // must not leave a phantom undo step. The start document itself comes back, so the
      // unsaved-changes flag (a reference compare) sees no edit either.
      const unchanged = deepEqual(store.getState().doc, gesture.start)
      if (unchanged) store.setState({ doc: gesture.start }) // still paused: not recorded
      const closed = close(token)
      if (!closed || unchanged) return
      // zundo has no public "push" API; its temporal store is a plain zustand store.
      temporal.setState((t) => ({
        pastStates: [...t.pastStates, { doc: closed.start }].slice(-HISTORY_LIMIT),
        futureStates: [],
      }))
    },

    cancelGesture: (token) => {
      if (gesture === null || gesture.token !== token) return
      const start = gesture.start
      store.setState({ doc: start }) // still paused: not recorded
      close(token)
    },

    isInGesture: () => gesture !== null,
  }
}

/** History of the app-wide document store. */
export const documentHistory = createHistory(useDocumentStore)
