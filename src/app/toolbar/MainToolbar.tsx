import {
  Anchor,
  Box,
  Columns2,
  FolderPlus,
  Link2,
  MousePointer2,
  Play,
  Redo2,
  Rows2,
  Square,
  Undo2,
} from "lucide-react"
import { useStore } from "zustand"
import { Separator } from "@/components/ui/separator"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { ToolbarButton } from "./ToolbarButton"

function ToolbarDivider() {
  return <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
}

export function MainToolbar() {
  const activeTool = useSessionStore((s) => s.activeTool)
  const testMode = useSessionStore((s) => s.testMode)
  const ortho = useSessionStore((s) => s.projection === "orthographic")
  const vertical = useSessionStore((s) => s.splitOrientation === "vertical")
  const canUndo = useStore(useDocumentStore.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(useDocumentStore.temporal, (s) => s.futureStates.length > 0)

  return (
    <div
      role="toolbar"
      aria-label="Main toolbar"
      className="flex h-9 shrink-0 items-center gap-0.5 border-b bg-surface px-2"
    >
      <ToolbarButton command="edit.undo" icon={Undo2} disabled={!canUndo} />
      <ToolbarButton command="edit.redo" icon={Redo2} disabled={!canRedo} />
      <ToolbarDivider />
      <ToolbarButton command="tool.select" icon={MousePointer2} pressed={activeTool === "select"} />
      <ToolbarButton command="tool.anchor" icon={Anchor} pressed={activeTool === "anchor"} />
      <ToolbarButton command="tool.mate" icon={Link2} pressed={activeTool === "mate"} />
      <ToolbarDivider />
      <ToolbarButton command="edit.newGroup" icon={FolderPlus} />
      <ToolbarDivider />
      <ToolbarButton command="view.toggleProjection" icon={Box} pressed={ortho} />
      <ToolbarButton
        command="view.toggleSplit"
        icon={vertical ? Rows2 : Columns2}
        pressed={vertical}
      />
      <div className="flex-1" />
      <ToolbarButton command="test.toggle" icon={testMode ? Square : Play} pressed={testMode} />
    </div>
  )
}
