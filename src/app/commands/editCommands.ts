import { SCENE_LIMITS, type GroupId, type PartId } from "@/core/schema"
import type { Command, CommandDeps } from "./types"

function selectedGroupIds(deps: CommandDeps): GroupId[] {
  return deps.session
    .getState()
    .selection.flatMap((item) => (item.kind === "group" ? [item.id] : []))
}

function selectedDirectPartIds(deps: CommandDeps): PartId[] {
  return deps.session
    .getState()
    .selection.flatMap((item) => (item.kind === "part" ? [item.id] : []))
}

function nextGroupName(deps: CommandDeps): string {
  const names = new Set(Object.values(deps.document.getState().doc.groups).map((g) => g.name))
  let n = 1
  while (names.has(`Group ${n}`)) n += 1
  return `Group ${n}`
}

export function editCommands(deps: CommandDeps): Command[] {
  const { document, history, session } = deps
  return [
    {
      id: "edit.undo",
      label: "Undo",
      shortcuts: ["Ctrl+Z"],
      repeatable: true,
      run: () => history.undo(),
      isEnabled: () => history.canUndo(),
    },
    {
      id: "edit.redo",
      label: "Redo",
      shortcuts: ["Ctrl+Shift+Z", "Ctrl+Y"],
      repeatable: true,
      run: () => history.redo(),
      isEnabled: () => history.canRedo(),
    },
    {
      id: "edit.delete",
      label: "Delete",
      shortcuts: ["Delete"],
      // Parts go with their anchors and mates; a deleted group's children move up a level.
      run: () => {
        const parts = selectedDirectPartIds(deps)
        const groups = selectedGroupIds(deps)
        if (parts.length === 0 && groups.length === 0) return
        document.getState().deleteItems(parts, groups)
        session.getState().clearSelection()
      },
      isEnabled: () => selectedDirectPartIds(deps).length + selectedGroupIds(deps).length > 0,
    },
    {
      id: "edit.newGroup",
      label: "New Group",
      shortcuts: ["Ctrl+G"],
      // Groups the selected parts and groups (under their shared parent); with nothing
      // selected, an empty group at the root.
      run: () => {
        const items = session.getState().selection
        const id = document.getState().groupItems(items, nextGroupName(deps))
        if (id) session.getState().select([{ kind: "group", id }])
        else {
          const message = `Groups can be nested at most ${SCENE_LIMITS.maxGroupDepth} deep.`
          deps.reportError({ kind: "invalidInput", message }, "New Group")
        }
      },
    },
    {
      id: "edit.clearSelection",
      label: "Clear Selection",
      shortcuts: ["Escape"],
      run: () => {
        session.getState().clearSelection()
        session.getState().setTool("select")
      },
    },
  ]
}
