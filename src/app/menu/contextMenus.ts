import type { CommandId } from "@/app/commands/types"
import type { ContextMenuPlace } from "@/store/session/contextMenuStore"

/** The commands each context menu offers, in order; null is a separator (PLAN 15.4). */
export const CONTEXT_MENUS: Readonly<Record<ContextMenuPlace, readonly (CommandId | null)[]>> = {
  viewport: [
    "view.toggleVisibility",
    "view.isolate",
    "view.showAll",
    null,
    "edit.newGroup",
    "part.toggleGrounded",
    "library.saveAsComponent",
    null,
    "view.fitAll",
    null,
    "edit.delete",
  ],
  tree: [
    "view.toggleVisibility",
    "view.isolate",
    "view.showAll",
    null,
    "edit.newGroup",
    "part.toggleGrounded",
    "library.saveAsComponent",
    null,
    "edit.delete",
  ],
  schematic: ["edit.delete"],
}
