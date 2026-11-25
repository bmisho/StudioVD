import {
  Anchor,
  Box,
  Cable,
  Columns2,
  FolderPlus,
  Link2,
  MousePointer2,
  Pin,
  Play,
  Redo2,
  RotateCcw,
  Rows2,
  Square,
  Undo2,
} from "lucide-react"
import { Toolbar } from "radix-ui"
import { useStore } from "zustand"
import { useDocumentStore } from "@/store/document/documentStore"
import { useAnchorTarget } from "@/store/session/anchorTargetStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { ToolbarButton } from "./ToolbarButton"

function ToolbarDivider() {
  return <Toolbar.Separator className="mx-1 h-5 w-px shrink-0 bg-border" />
}

export function MainToolbar() {
  const activeTool = useSessionStore((s) => s.activeTool)
  const drawingCables = useAnchorTarget((s) => s.target?.kind === "cable")
  const testMode = useSessionStore((s) => s.testMode)
  const ortho = useSessionStore((s) => s.projection === "orthographic")
  const vertical = useSessionStore((s) => s.splitOrientation === "vertical")
  const canUndo = useStore(useDocumentStore.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(useDocumentStore.temporal, (s) => s.futureStates.length > 0)

  return (
    // Radix Toolbar: one tab stop, arrow keys / Home / End move between buttons.
    <Toolbar.Root
      aria-label="Main toolbar"
      loop={false}
      className="flex h-9 shrink-0 items-center gap-0.5 border-b bg-surface px-2"
    >
      <ToolbarButton command="edit.undo" icon={Undo2} disabled={!canUndo} />
      <ToolbarButton command="edit.redo" icon={Redo2} disabled={!canRedo} />
      <ToolbarDivider />
      <ToolbarButton command="tool.select" icon={MousePointer2} pressed={activeTool === "select"} />
      <ToolbarButton
        command="tool.anchor"
        icon={Anchor}
        pressed={activeTool === "anchor" && !drawingCables}
      />
      <ToolbarButton command="tool.mate" icon={Link2} pressed={activeTool === "mate"} />
      <ToolbarButton command="tool.cable" icon={Cable} pressed={drawingCables} />
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
      <ToolbarButton command="test.reset" icon={RotateCcw} disabled={!testMode} />
      <ToolbarButton command="test.applyPose" icon={Pin} disabled={!testMode} />
      <ToolbarButton command="test.toggle" icon={testMode ? Square : Play} pressed={testMode} />
    </Toolbar.Root>
  )
}
