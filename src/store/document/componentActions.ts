import { produce } from "immer"
import {
  checkIntegrity,
  type ComponentDefSnapshot,
  type ComponentInstanceId,
  type GeometryAsset,
} from "@/core/schema"
import type { Get, Set } from "./actionTypes"
import { unlinkInstance } from "./componentUpkeep"
import { regenerateInstance } from "./regeneration"

export interface ComponentActions {
  /** Unlink (PLAN 9.5): its parts become plain parts in its group. ONE undo entry. */
  unlinkComponent: (id: ComponentInstanceId) => void
  /**
   * Edit parameters (PLAN 9.5): rebuilt from `def` with `assets` (by part key), keys kept so
   * outside mates survive. ONE undo entry; throws rather than write a document Open would
   * refuse.
   */
  regenerateComponent: (
    id: ComponentInstanceId,
    def: ComponentDefSnapshot,
    assets: Record<string, GeometryAsset>
  ) => void
}

export function componentActions(set: Set, get: Get): ComponentActions {
  return {
    unlinkComponent: (id) => {
      if (!Object.hasOwn(get().doc.components, id)) return
      set((s) => unlinkInstance(s.doc, id))
    },
    regenerateComponent: (id, def, assets) => {
      const next = produce(get().doc, (d) => regenerateInstance(d, id, def, assets))
      const problems = checkIntegrity(next)
      if (problems.length > 0)
        throw new Error(problems.map((p) => `${p.path}: ${p.message}`).join("; "))
      set((s) => {
        s.doc = next
      })
    },
  }
}
