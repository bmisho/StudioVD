import { lazy, Suspense } from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { ViewportLoading } from "@/features/viewport/ViewportLoading"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/store/session/sessionStore"
import { PaneFrame } from "./PaneFrame"
import { useCollapsiblePanel } from "./useCollapsiblePanel"

// The schematic editor (React Flow) loads in its own chunk too.
const SchematicEditor = lazy(() =>
  import("@/features/schematic/SchematicEditor").then((m) => ({ default: m.SchematicEditor }))
)

// three.js, R3F and camera-controls load in their own chunk, so the shell paints first.
const Viewport3D = lazy(() =>
  import("@/features/viewport/Viewport3D").then((m) => ({ default: m.Viewport3D }))
)

/**
 * 3D view and schematic side by side (or stacked). Nothing here ever remounts: orientation is
 * a live prop, and maximizing collapses the other pane. From Phase 3 the 3D pane holds a
 * WebGL canvas, and a remount would recreate the GPU context and reload every mesh.
 */
export function CenterSplit() {
  const orientation = useSessionStore((s) => s.splitOrientation)
  const maximized = useSessionStore((s) => s.maximizedPane)
  const viewport = useCollapsiblePanel(maximized !== "schematic")
  const schematic = useCollapsiblePanel(maximized !== "viewport")

  return (
    <ResizablePanelGroup id="center-split" orientation={orientation}>
      <ResizablePanel
        id="viewport"
        panelRef={viewport.panelRef}
        onResize={viewport.onResize}
        defaultSize="60"
        minSize="20"
        collapsible
        collapsedSize="0"
      >
        <PaneFrame pane="viewport" title="3D View" hidden={viewport.collapsed}>
          <Suspense fallback={<ViewportLoading />}>
            <Viewport3D />
          </Suspense>
        </PaneFrame>
      </ResizablePanel>
      <ResizableHandle
        withHandle
        aria-label="Resize the 3D view and schematic"
        disabled={maximized !== null}
        className={cn(maximized !== null && "hidden")}
      />
      <ResizablePanel
        id="schematic"
        panelRef={schematic.panelRef}
        onResize={schematic.onResize}
        defaultSize="40"
        minSize="15"
        collapsible
        collapsedSize="0"
      >
        <PaneFrame pane="schematic" title="Schematic" hidden={schematic.collapsed}>
          <Suspense fallback={<div className="h-full bg-background" />}>
            <SchematicEditor />
          </Suspense>
        </PaneFrame>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
