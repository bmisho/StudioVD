import { temporal } from "zundo"
import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { APP_VERSION } from "@/core/app-info"
import { createEmptyDocument, newId, type GroupId, type SceneDocument } from "@/core/schema"

/** Maximum undo depth. Snapshots share structure (immer), so each costs only what changed. */
export const HISTORY_LIMIT = 200

export interface DocumentState {
  /** The persisted, undoable document (CLAUDE.md §4, kind 1). */
  doc: SceneDocument
  /** Replaces the whole document (open, new). The caller decides whether to clear history. */
  replaceDocument: (doc: SceneDocument) => void
  createGroup: (name: string, parentId?: GroupId | null) => GroupId
  renameGroup: (id: GroupId, name: string) => void
  /** Deletes groups; their children move up to the deleted group's parent. */
  deleteGroups: (ids: readonly GroupId[]) => void
}

/** Only `doc` is recorded in history; actions are functions and never change. */
type HistoryState = Pick<DocumentState, "doc">

export function createDocumentStore(initial?: SceneDocument) {
  return create<DocumentState>()(
    temporal(
      immer((set) => ({
        doc: initial ?? createEmptyDocument(APP_VERSION),

        replaceDocument: (doc) => set({ doc }),

        createGroup: (name, parentId = null) => {
          const id = newId<GroupId>()
          set((s) => {
            s.doc.groups[id] = { id, name, parentId }
          })
          return id
        },

        renameGroup: (id, name) => {
          const trimmed = name.trim()
          set((s) => {
            const group = s.doc.groups[id]
            if (group && trimmed.length > 0 && group.name !== trimmed) group.name = trimmed
          })
        },

        deleteGroups: (ids) => {
          set((s) => {
            for (const id of ids) {
              const group = s.doc.groups[id]
              if (!group) continue
              for (const child of Object.values(s.doc.groups)) {
                if (child.parentId === id) child.parentId = group.parentId
              }
              for (const part of Object.values(s.doc.parts)) {
                if (part.parentId === id) part.parentId = group.parentId
              }
              delete s.doc.groups[id]
            }
          })
        },
      })),
      {
        partialize: (state): HistoryState => ({ doc: state.doc }),
        // immer keeps `doc` referentially equal when an action changes nothing, so no-op
        // actions (renaming to the same name, deleting a missing id) add no undo entry.
        equality: (past, current) => past.doc === current.doc,
        limit: HISTORY_LIMIT,
      }
    )
  )
}

export type DocumentStore = ReturnType<typeof createDocumentStore>

/** The app-wide document store. Tests create their own with `createDocumentStore()`. */
export const useDocumentStore = createDocumentStore()
