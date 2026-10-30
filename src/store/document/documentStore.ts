import { temporal } from "zundo"
import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { APP_VERSION } from "@/core/app-info"
import { entityBatchProblems, type EntityBatch } from "@/core/scene/entityBatch"
import { nestsTooDeep } from "@/core/scene/groupNesting"
import {
  createEmptyDocument,
  NameSchema,
  newId,
  type GroupId,
  type SceneDocument,
} from "@/core/schema"
import { removeGroups } from "./deletion"
import { anchorActions, type AnchorActions } from "./anchorActions"
import { componentActions, type ComponentActions } from "./componentActions"
import { mateActions, type MateActions } from "./mateActions"
import { materialActions, type MaterialActions } from "./materialActions"
import { partActions, type PartActions } from "./partActions"

/** Maximum undo depth. Snapshots share structure (immer), so each costs only what changed. */
export const HISTORY_LIMIT = 200

export interface DocumentState
  extends PartActions, MaterialActions, AnchorActions, MateActions, ComponentActions {
  /** The persisted, undoable document (CLAUDE.md §4, kind 1). */
  doc: SceneDocument
  /** Replaces the whole document (open, new). The caller decides whether to clear history. */
  replaceDocument: (doc: SceneDocument) => void
  /**
   * Creates a group. An unknown parent (e.g. undone meanwhile) falls back to the root; one
   * already at the deepest nesting a file may hold throws (callers pass known parents).
   */
  createGroup: (name: string, parentId?: GroupId | null) => GroupId
  /** Renames a group; names the schema would reject (empty, too long) are ignored. */
  renameGroup: (id: GroupId, name: string) => void
  /** Deletes groups; their children move up to the deleted group's parent. */
  deleteGroups: (ids: readonly GroupId[]) => void
  /**
   * Inserts assets, groups, parts, anchors and mates as ONE undo entry. Throws on an invalid batch
   * (duplicate id, dangling reference): callers build batches, users never type them.
   */
  insertEntities: (batch: EntityBatch) => void
}

/** Only `doc` is recorded in history; actions are functions and never change. */
type HistoryState = Pick<DocumentState, "doc">

export function createDocumentStore(initial?: SceneDocument) {
  return create<DocumentState>()(
    temporal(
      immer((set, get) => ({
        doc: initial ?? createEmptyDocument(APP_VERSION),

        replaceDocument: (doc) => set({ doc }),

        createGroup: (name, parentId = null) => {
          // Store actions must never produce a document the schema rejects (scene.json is the
          // contract). A bad name here is a programming error, not user input.
          const valid = NameSchema.parse(name)
          const id = newId<GroupId>()
          set((s) => {
            const parent =
              parentId !== null && Object.hasOwn(s.doc.groups, parentId) ? parentId : null
            if (nestsTooDeep(s.doc.groups, { [id]: parent }))
              throw new Error("Groups cannot be nested any deeper.")
            s.doc.groups[id] = { id, name: valid, parentId: parent }
          })
          return id
        },

        renameGroup: (id, name) => {
          const parsed = NameSchema.safeParse(name)
          if (!parsed.success) return
          set((s) => {
            const group = Object.hasOwn(s.doc.groups, id) ? s.doc.groups[id] : undefined
            if (group && group.name !== parsed.data) group.name = parsed.data
          })
        },

        deleteGroups: (ids) => set((s) => removeGroups(s.doc, ids)),

        ...partActions(set),
        ...materialActions(set, get),
        ...anchorActions(set, get),
        ...mateActions(set, get),
        ...componentActions(set, get),

        insertEntities: (batch) => {
          const problems = entityBatchProblems(get().doc, batch)
          if (problems.length > 0) throw new Error(`Invalid entity batch: ${problems.join("; ")}`)
          set((s) => {
            const d = s.doc
            for (const a of batch.assets ?? [])
              if (!Object.hasOwn(d.assets, a.id)) d.assets[a.id] = a
            for (const t of batch.textures ?? [])
              if (!Object.hasOwn(d.textures, t.id)) d.textures[t.id] = t
            for (const m of batch.materials ?? []) d.materials[m.id] = m
            for (const g of batch.groups ?? []) d.groups[g.id] = g
            for (const p of batch.parts ?? []) d.parts[p.id] = p
            for (const a of batch.anchors ?? []) d.anchors[a.id] = a
            for (const m of batch.mates ?? []) d.mates[m.id] = m
            for (const def of batch.componentDefs ?? [])
              if (!Object.hasOwn(d.componentDefs, def.key)) d.componentDefs[def.key] = def
            for (const c of batch.components ?? []) d.components[c.id] = c
            for (const l of batch.licenseTexts ?? [])
              if (!Object.hasOwn(d.licenseTexts, l.sha256)) d.licenseTexts[l.sha256] = l.text
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
