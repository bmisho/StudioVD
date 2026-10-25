import { ADD_REFUSAL_TEXT, REFUSAL_TEXT } from "@/core/assembly/mateNames"
import { SCENE_LIMITS, type AnchorId, type GroupId, type MateId, type PartId } from "@/core/schema"
import { applyMateDraft } from "@/features/assembly/mateTool"
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

function selectedAnchorIds(deps: CommandDeps): AnchorId[] {
  return deps.session
    .getState()
    .selection.flatMap((item) => (item.kind === "anchor" ? [item.id] : []))
}

function selectedMateIds(deps: CommandDeps): MateId[] {
  return deps.session
    .getState()
    .selection.flatMap((item) => (item.kind === "mate" ? [item.id] : []))
}

/** The parts the given anchors are on, each once, in selection order. */
function anchorParts(deps: CommandDeps, anchors: AnchorId[]): PartId[] {
  const all = deps.document.getState().doc.anchors
  const parts = anchors.flatMap((id) => {
    const anchor = Object.hasOwn(all, id) ? all[id] : undefined
    return anchor ? [anchor.partId] : []
  })
  return [...new Set(parts)]
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
      // Parts go with their anchors and mates; a deleted group's children move up a level;
      // anchors go with their mates, and then their parts are shown (the inspector's Delete
      // anchor does the same); mates go with their couplings.
      run: () => {
        const parts = selectedDirectPartIds(deps)
        const groups = selectedGroupIds(deps)
        const anchors = selectedAnchorIds(deps)
        const mates = selectedMateIds(deps)
        if (parts.length + groups.length + anchors.length + mates.length === 0) return
        const owners = parts.length + groups.length === 0 ? anchorParts(deps, anchors) : []
        document.getState().deleteItems(parts, groups, anchors, mates)
        session.getState().select(owners.map((id) => ({ kind: "part", id })))
      },
      isEnabled: () =>
        selectedDirectPartIds(deps).length +
          selectedGroupIds(deps).length +
          selectedAnchorIds(deps).length +
          selectedMateIds(deps).length >
        0,
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
      id: "tool.mateApply",
      label: "Apply Mate",
      shortcuts: ["Ctrl+Enter"],
      allowInTextInput: true, // while typing its angle
      // What the New Mate panel's Apply does, also with the Properties panel collapsed.
      run: () => {
        const result = applyMateDraft(document, session)
        if (!result || result.ok) return
        const { reason } = result
        const message =
          reason === "full" || reason === "invalid"
            ? ADD_REFUSAL_TEXT[reason]
            : REFUSAL_TEXT[reason]
        deps.reportError({ kind: "invalidInput", message }, "Apply Mate")
      },
      isEnabled: () => {
        const s = session.getState()
        return s.activeTool === "mate" && !!s.mateDraft?.anchorB
      },
      disabledReason: "pick two anchors with the Mate tool first",
    },
    {
      id: "edit.clearSelection",
      label: "Clear Selection",
      shortcuts: ["Escape"],
      // The Mate tool's picks go first, then a tool ends (keeping what it made selected),
      // then the selection.
      run: () => {
        const s = session.getState()
        if (s.mateDraft) s.setMateDraft(null)
        else if (s.activeTool !== "select") s.setTool("select")
        else s.clearSelection()
      },
    },
  ]
}
