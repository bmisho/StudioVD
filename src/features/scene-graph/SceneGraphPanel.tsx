import { useMemo } from "react"
import { FolderPlus, Trash2 } from "lucide-react"
import { useCommands } from "@/app/commands/commandsContext"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { buildSceneTree } from "@/core/scene/sceneTree"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { SceneTree } from "./SceneTree"

export function SceneGraphPanel() {
  const registry = useCommands()
  const groups = useDocumentStore((s) => s.doc.groups)
  const parts = useDocumentStore((s) => s.doc.parts)
  const tree = useMemo(() => buildSceneTree({ groups, parts }), [groups, parts])
  // Same rule as Edit › Delete: any selected part or group.
  const canDelete = useSessionStore((s) =>
    s.selection.some((i) => i.kind === "group" || i.kind === "part")
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b px-2">
        <span className="text-xs font-medium text-muted-foreground">Assembly</span>
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-7"
            aria-label="New group"
            title="New group (Ctrl+G)"
            onClick={() => registry.run("edit.newGroup")}
          >
            <FolderPlus />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete selected"
            title={canDelete ? "Delete (Delete)" : "Delete: select parts or groups first"}
            // aria-disabled, not disabled: it stays focusable and its tooltip explains (§7).
            aria-disabled={!canDelete}
            className={canDelete ? "size-7" : "size-7 opacity-50"}
            onClick={() => canDelete && registry.run("edit.delete")}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {tree.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            No parts yet. Import CAD files with File › Import (Ctrl+I) or drop them on the window.
          </p>
        ) : (
          <SceneTree tree={tree} />
        )}
      </ScrollArea>
    </div>
  )
}
