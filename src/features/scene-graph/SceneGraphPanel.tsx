import { useMemo } from "react"
import { FolderPlus, Trash2 } from "lucide-react"
import { useCommands } from "@/app/commands/commandsContext"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { buildSceneTree } from "@/core/scene/sceneTree"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { SceneTreeRow } from "./SceneTreeRow"

export function SceneGraphPanel() {
  const registry = useCommands()
  const groups = useDocumentStore((s) => s.doc.groups)
  const parts = useDocumentStore((s) => s.doc.parts)
  const tree = useMemo(() => buildSceneTree({ groups, parts }), [groups, parts])
  const hasGroupSelected = useSessionStore((s) => s.selection.some((i) => i.kind === "group"))

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b px-2">
        <span className="text-xs font-medium text-muted-foreground">Assembly</span>
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
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
            title="Delete (Delete)"
            disabled={!hasGroupSelected}
            onClick={() => registry.run("edit.delete")}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {tree.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            No parts yet. Import CAD files with File › Import (Phase 4), or create a group to
            organise the assembly.
          </p>
        ) : (
          <ul role="tree" aria-label="Scene graph" className="p-1">
            {tree.map((node) => (
              <SceneTreeRow key={node.id} node={node} level={1} />
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
