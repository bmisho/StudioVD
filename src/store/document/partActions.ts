import type { Draft } from "immer"
import { nestsTooDeep } from "@/core/scene/groupNesting"
import { commonParent, topLevelItems } from "@/core/scene/partOps"
import type { SelectionRef } from "@/core/scene/selection"
import {
  type AnchorId,
  NameSchema,
  newId,
  PoseSchema,
  type GroupId,
  type MateId,
  type PartId,
  type Pose,
  type SceneDocument,
} from "@/core/schema"
import { removeAnchors, removeGroups, removeMates, removeParts } from "./deletion"

export interface PartActions {
  /** Renames a part; names the schema would reject are ignored (like `renameGroup`). */
  renamePart: (id: PartId, name: string) => void
  setPartsVisible: (ids: readonly PartId[], visible: boolean) => void
  /** Grounded parts are fixed in test mode (PLAN 4.7); in design mode they still move. */
  setPartsGrounded: (ids: readonly PartId[], grounded: boolean) => void
  /** Deletes parts with their anchors, mates, couplings, bindings and unused assets. */
  deleteParts: (ids: readonly PartId[]) => void
  /**
   * Deletes parts, groups and anchors together: ONE undo entry (Edit › Delete on a mixed
   * selection). Anchors go with the mates on them.
   */
  deleteItems: (
    parts: readonly PartId[],
    groups: readonly GroupId[],
    anchors?: readonly AnchorId[],
    mates?: readonly MateId[]
  ) => void
  /**
   * Moves the selected parts and groups (outermost ones) into a new group under their shared
   * parent. With nothing to move, creates an empty group at the root. Returns its id, or
   * null (and changes nothing) when groups would nest deeper than a file may hold.
   */
  groupItems: (items: readonly SelectionRef[], name: string) => GroupId | null
  /** Design pose from the transform gizmo; an invalid pose is ignored. */
  setPartPose: (id: PartId, pose: Pose) => void
}

type Set = (fn: (state: Draft<{ doc: SceneDocument }>) => void) => void

export function partActions(set: Set): PartActions {
  const each = (ids: readonly PartId[], fn: (part: SceneDocument["parts"][PartId]) => void) =>
    set((s) => {
      for (const id of ids) {
        const part = Object.hasOwn(s.doc.parts, id) ? s.doc.parts[id] : undefined
        if (part) fn(part)
      }
    })

  return {
    renamePart: (id, name) => {
      const parsed = NameSchema.safeParse(name)
      if (!parsed.success) return
      each([id], (part) => {
        if (part.name !== parsed.data) part.name = parsed.data
      })
    },

    setPartsVisible: (ids, visible) =>
      each(ids, (part) => {
        if (part.visible !== visible) part.visible = visible
      }),

    setPartsGrounded: (ids, grounded) =>
      each(ids, (part) => {
        if (part.grounded !== grounded) part.grounded = grounded
      }),

    deleteParts: (ids) => set((s) => removeParts(s.doc, ids)),

    deleteItems: (parts, groups, anchors = [], mates = []) =>
      set((s) => {
        // A component's group goes with the whole component (its parts, anchors, mates).
        const whole = groups.flatMap((g) =>
          Object.values(s.doc.components)
            .filter((c) => c.groupId === g)
            .flatMap((c) => Object.values(c.parts))
        )
        removeParts(s.doc, [...parts, ...whole])
        removeGroups(s.doc, groups)
        removeAnchors(s.doc, anchors)
        removeMates(s.doc, mates)
      }),

    groupItems: (items, name) => {
      const valid = NameSchema.parse(name) // a programming error, not user input
      const id = newId<GroupId>()
      let grouped = false
      set((s) => {
        const moving = topLevelItems(s.doc, items)
        const parentId = commonParent(s.doc, moving)
        const moves: Record<string, string | null> = { [id]: parentId }
        for (const item of moving) if (item.kind === "group") moves[item.id] = id
        if (nestsTooDeep(s.doc.groups, moves)) return
        grouped = true
        s.doc.groups[id] = { id, name: valid, parentId }
        for (const item of moving) {
          if (item.kind === "part") {
            const part = s.doc.parts[item.id as PartId]
            if (part) part.parentId = id
          } else {
            const group = s.doc.groups[item.id as GroupId]
            if (group) group.parentId = id
          }
        }
      })
      return grouped ? id : null
    },

    setPartPose: (id, pose) => {
      if (!PoseSchema.safeParse(pose).success) return
      each([id], (part) => {
        part.pose = { positionMm: [...pose.positionMm], quaternion: [...pose.quaternion] }
      })
    },
  }
}
