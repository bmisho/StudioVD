import { serializeScene } from "@/core/schema"
import type { Result } from "@/lib/tauri/result"
import type { DocumentStore } from "@/store/document/documentStore"
import type { History } from "@/store/document/history"
import type { ProjectStore } from "@/store/session/projectStore"
import type { DirtyTracker } from "./dirtyTracker"

export interface AutosaveDeps {
  document: DocumentStore
  history: History
  project: ProjectStore
  tracker: DirtyTracker
  write: (scene: Uint8Array) => Promise<Result<void>>
  clear: () => Promise<Result<void>>
  appVersion: string
  now: () => number
  /** Quiet time after the last edit before writing. */
  delayMs?: number
  /** Longest wait during continuous editing. */
  maxWaitMs?: number
}

/**
 * Autosave for crash recovery (PLAN 5.5): unsaved changes go to the workspace (never to the
 * user's .stvd) a moment after editing stops, at least every `maxWaitMs`. Waits out gestures
 * and project operations; `idle()` lets those wait for a write in flight. Back at the saved
 * document (undo, save), the autosave is removed: a clean exit leaves nothing to recover.
 */
export function createAutosaver(deps: AutosaveDeps) {
  const { delayMs = 2000, maxWaitMs = 30_000 } = deps
  let timer: ReturnType<typeof setTimeout> | null = null
  let firstChange: number | null = null
  // Writes and clears run one after another, in the order they were asked for: a clear
  // must never overtake a write still in flight (a stale autosave would then survive).
  let queue: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(op: () => Promise<T>): Promise<T> => {
    const next = queue.then(op, op)
    queue = next
    return next
  }
  /** An autosave may exist (one was written or is being written). */
  let written = false

  const schedule = (ms: number) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => void flush(), ms)
  }

  async function flush() {
    timer = null
    if (deps.project.getState().busy !== null || deps.history.isInGesture()) {
      schedule(delayMs)
      return
    }
    const doc = deps.document.getState().doc
    firstChange = null
    if (deps.tracker.isSaved(doc)) return
    const serialized = serializeScene(doc, deps.appVersion)
    if (!serialized.ok) return // never happens for store documents; nothing to recover from
    const bytes = new TextEncoder().encode(serialized.json)
    written = true
    const result = await enqueue(() => deps.write(bytes))
    if (result.ok && !deps.tracker.isSaved(deps.document.getState().doc))
      deps.project.getState().markAutosaved(deps.now())
  }

  const unsubscribe = deps.document.subscribe((state) => {
    if (deps.tracker.isSaved(state.doc)) {
      if (timer !== null) clearTimeout(timer)
      timer = null
      firstChange = null
      if (written) {
        written = false
        void enqueue(() => deps.clear())
        deps.project.getState().markAutosaved(null)
      }
      return
    }
    const now = deps.now()
    firstChange ??= now
    schedule(now - firstChange >= maxWaitMs ? 0 : delayMs)
  })

  return {
    /** Resolves once no autosave write or clear is in flight. */
    idle: async () => {
      await queue
    },
    dispose() {
      unsubscribe()
      if (timer !== null) clearTimeout(timer)
    },
  }
}

export type Autosaver = ReturnType<typeof createAutosaver>
