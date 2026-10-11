import { partsInSelection } from "@/core/scene/partsInSelection"
import type { PartId } from "@/core/schema"
import type { Command, CommandDeps } from "./types"

/** Parts the selection covers: selected parts plus every part below a selected group. */
export function selectedPartIds({ document, session }: CommandDeps): PartId[] {
  const { doc } = document.getState()
  return [...partsInSelection(doc, session.getState().selection)]
}

/** Visibility, isolation and grounding of the selected parts (PLAN 4.7). */
export function partCommands(deps: CommandDeps): Command[] {
  const { document, session } = deps
  const parts = () => {
    const { doc } = document.getState()
    return selectedPartIds(deps).flatMap((id) => (doc.parts[id] ? [doc.parts[id]] : []))
  }
  const hasParts = () => parts().length > 0
  return [
    {
      id: "view.toggleVisibility",
      label: "Hide/Show",
      shortcuts: ["H"],
      // Hides when anything selected is visible, so a mixed selection hides first.
      run: () => {
        const selected = parts()
        const show = selected.every((p) => !p.visible)
        document.getState().setPartsVisible(
          selected.map((p) => p.id),
          show
        )
      },
      isEnabled: hasParts,
    },
    {
      id: "view.showAll",
      label: "Show All Parts",
      run: () => {
        const all = Object.keys(document.getState().doc.parts) as PartId[]
        document.getState().setPartsVisible(all, true)
      },
      isEnabled: () => Object.values(document.getState().doc.parts).some((p) => !p.visible),
    },
    {
      id: "view.isolate",
      label: "Isolate",
      shortcuts: ["I"],
      run: () => session.getState().toggleIsolation(selectedPartIds(deps)),
      isEnabled: () => session.getState().isolated !== null || hasParts(),
      isChecked: () => session.getState().isolated !== null,
    },
    {
      id: "transform.translate",
      label: "Move Gizmo",
      shortcuts: ["T"],
      run: () => session.getState().setGizmoMode("translate"),
      isChecked: () => session.getState().gizmoMode === "translate",
    },
    {
      id: "transform.rotate",
      label: "Rotate Gizmo",
      shortcuts: ["R"],
      run: () => session.getState().setGizmoMode("rotate"),
      isChecked: () => session.getState().gizmoMode === "rotate",
    },
    {
      id: "part.toggleGrounded",
      label: "Grounded",
      run: () => {
        const selected = parts()
        const ground = !selected.every((p) => p.grounded)
        document.getState().setPartsGrounded(
          selected.map((p) => p.id),
          ground
        )
      },
      isEnabled: hasParts,
      isChecked: () => {
        const selected = parts()
        return selected.length > 0 && selected.every((p) => p.grounded)
      },
    },
  ]
}
