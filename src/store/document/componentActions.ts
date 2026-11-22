import { produce } from "immer"
import { instantiateComponent } from "@/core/library/instantiate"
import { toPose } from "@/core/math/rigid"
import { entityBatchProblems } from "@/core/scene/entityBatch"
import {
  checkIntegrity,
  type ComponentDefSnapshot,
  type ComponentInstanceId,
  type GeometryAsset,
  type GroupId,
  type LicenseText,
  type SceneDocument,
} from "@/core/schema"
import type { Get, Set } from "./actionTypes"
import { applyEntityBatch } from "./applyBatch"
import { unlinkInstance } from "./componentUpkeep"
import { removeGroups, removeParts, removeSchematic } from "./deletion"
import { instanceFrame, regenerateInstance } from "./regeneration"

type LicenseTexts = readonly { sha256: string; text: LicenseText }[]

export interface ComponentActions {
  /** Unlink (PLAN 9.5): its parts become plain parts in its group. ONE undo entry. */
  unlinkComponent: (id: ComponentInstanceId) => void
  /**
   * Edit parameters (PLAN 9.5) and same-MAJOR Update (14.6): rebuilt from `def` with
   * `assets` (by part key), keys kept so outside mates survive. ONE undo entry; throws rather
   * than write a document Open would refuse.
   */
  regenerateComponent: (
    id: ComponentInstanceId,
    def: ComponentDefSnapshot,
    assets: Record<string, GeometryAsset>,
    licenseTexts?: LicenseTexts
  ) => void
  /**
   * Replace (PLAN 4.6, 14.6, a new MAJOR): the instance and what hangs on it (its mates to
   * other parts, its block, its bindings) go; the new version is placed in its frame. ONE
   * undo entry. Returns the new component's group.
   */
  replaceComponent: (
    id: ComponentInstanceId,
    def: ComponentDefSnapshot,
    assets: Record<string, GeometryAsset>,
    licenseTexts: LicenseTexts
  ) => GroupId
}

function checked(doc: SceneDocument): SceneDocument {
  const problems = checkIntegrity(doc)
  if (problems.length > 0)
    throw new Error(problems.map((p) => `${p.path}: ${p.message}`).join("; "))
  return doc
}

export function componentActions(set: Set, get: Get): ComponentActions {
  return {
    unlinkComponent: (id) => {
      if (!Object.hasOwn(get().doc.components, id)) return
      set((s) => unlinkInstance(s.doc, id))
    },
    regenerateComponent: (id, def, assets, licenseTexts = []) => {
      const next = checked(
        produce(get().doc, (d) => regenerateInstance(d, id, def, assets, licenseTexts))
      )
      set((s) => {
        s.doc = next
      })
    },
    replaceComponent: (id, def, assets, licenseTexts) => {
      const doc = get().doc
      const c = Object.hasOwn(doc.components, id) ? doc.components[id] : undefined
      const old =
        c?.def && Object.hasOwn(doc.componentDefs, c.def) ? doc.componentDefs[c.def] : undefined
      if (!c || !old) throw new Error("This component has no definition to replace.")
      const frame = instanceFrame(doc, c, old.manifest)
      const removed = produce(doc, (d) => {
        if (c.nodeId !== undefined) removeSchematic(d, [c.nodeId], [])
        removeParts(d, Object.values(c.parts))
        removeGroups(d, [c.groupId])
      })
      const placed = instantiateComponent(removed, {
        def,
        assets,
        pose: toPose(frame),
        licenseTexts: [...licenseTexts],
      })
      const problems = entityBatchProblems(removed, placed.batch)
      if (problems.length > 0) throw new Error(`Invalid entity batch: ${problems.join("; ")}`)
      const next = checked(produce(removed, (d) => applyEntityBatch(d, placed.batch)))
      set((s) => {
        s.doc = next
      })
      return placed.group
    },
  }
}
