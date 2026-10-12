import type { SceneDocument } from "@/core/schema"
import type { DocumentStore } from "@/store/document/documentStore"
import type { ProjectStore } from "@/store/session/projectStore"

/**
 * Unsaved changes = the document is not the one last saved or opened (PLAN 5.3). A reference
 * compare: immer gives every change a new document, and undo hands back the exact earlier
 * one, so undoing back to the saved state is clean again for free.
 */
export function createDirtyTracker(
  document: DocumentStore,
  project: ProjectStore,
  report: (dirty: boolean) => void
) {
  let saved: SceneDocument | null = document.getState().doc
  const update = () => {
    const dirty = document.getState().doc !== saved
    if (project.getState().dirty === dirty) return
    project.getState().setDirty(dirty)
    report(dirty) // Rust: window title and the close guard
  }
  const unsubscribe = document.subscribe(update)
  return {
    /** `doc` is what the project's file now holds (a save of that snapshot finished). */
    markSaved(doc: SceneDocument) {
      saved = doc
      update()
    },
    /**
     * The document about to replace the open one (New, Open): `null` when nothing on disk
     * matches it (a recovered session). The replacement itself updates the flag, so it
     * never flickers through "unsaved" on the way.
     */
    expect(doc: SceneDocument | null) {
      saved = doc
    },
    isSaved: (doc: SceneDocument) => doc === saved,
    dispose: unsubscribe,
  }
}

export type DirtyTracker = ReturnType<typeof createDirtyTracker>
