import type { GroupId } from "@/core/schema"
import type { Command, CommandDeps } from "./types"

function selectedGroupIds(deps: CommandDeps): GroupId[] {
  return deps.session
    .getState()
    .selection.flatMap((item) => (item.kind === "group" ? [item.id] : []))
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
      run: () => history.undo(),
      isEnabled: () => history.canUndo(),
    },
    {
      id: "edit.redo",
      label: "Redo",
      shortcuts: ["Ctrl+Shift+Z", "Ctrl+Y"],
      run: () => history.redo(),
      isEnabled: () => history.canRedo(),
    },
    {
      id: "edit.delete",
      label: "Delete",
      shortcuts: ["Delete"],
      run: () => {
        const ids = selectedGroupIds(deps)
        if (ids.length === 0) return
        document.getState().deleteGroups(ids)
        session.getState().clearSelection()
      },
      isEnabled: () => selectedGroupIds(deps).length > 0,
    },
    {
      id: "edit.newGroup",
      label: "New Group",
      shortcuts: ["Ctrl+G"],
      run: () => {
        const parent = selectedGroupIds(deps)[0] ?? null
        const id = document.getState().createGroup(nextGroupName(deps), parent)
        session.getState().select([{ kind: "group", id }])
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
