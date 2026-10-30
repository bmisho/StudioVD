import { instantiateComponent } from "@/core/library/instantiate"
import { placePose } from "@/core/library/placement"
import type { Pose } from "@/core/schema"
import type { InsertionDeps } from "./insertionController"
import { placementTarget } from "./placementTarget"
import type { ReadyComponent } from "./prepareInsertion"

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The steps an insertion shares between a drag and Enter: guard, place, insert. */
export function insertionSteps(deps: InsertionDeps) {
  return {
    /** Test mode or a project operation running: nothing is inserted (and the user is told). */
    blocked: (): boolean => {
      if (deps.session.getState().testMode) {
        deps.notify.info("Leave test mode to insert components")
        return true
      }
      if (deps.projectBusy()) {
        deps.notify.info("The project is busy", "Insert the component once it has finished.")
        return true
      }
      return false
    },
    /** Where the component would go for the cursor at (x, y), or null off the view. */
    place: (ready: ReadyComponent, x: number, y: number, noSnap: boolean, turns: number) => {
      const doc = deps.document.getState().doc
      const found = placementTarget(doc, ready.def.manifest, deps.view, x, y, noSnap)
      if (!found) return null
      return {
        pose: placePose(ready.def.manifest, ready.assets, found.target, turns),
        snap: found.snap,
      }
    },
    /** ONE undo entry, then the component is selected (as its group). */
    insert: (ready: ReadyComponent, pose: Pose): void => {
      const placed = instantiateComponent(deps.document.getState().doc, { ...ready, pose })
      try {
        deps.document.getState().insertEntities(placed.batch)
      } catch (e) {
        deps.notify.error("The component could not be added", message(e))
        return
      }
      const session = deps.session.getState()
      if (session.isolated) session.toggleIsolation([])
      session.select([{ kind: "group", id: placed.group }])
    },
  }
}
