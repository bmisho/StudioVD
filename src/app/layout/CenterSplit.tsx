import { useEffect } from "react"
import { usePanelRef } from "react-resizable-panels"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { SchematicPlaceholder } from "@/features/schematic/SchematicPlaceholder"
import { ViewportPlaceholder } from "@/features/viewport/ViewportPlaceholder"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/store/session/sessionStore"
import { PaneFrame } from "./PaneFrame"

/**
 * 3D view and schematic side by side (or stacked). Maximizing collapses the other pane
 * instead of unmounting it: from Phase 3 the 3D pane holds a WebGL canvas, and remounting
 * would recreate the GPU context and reload every mesh.
 */
export function CenterSplit() {
  const orientation = useSessionStore((s) => s.splitOrientation)
  const maximized = useSessionStore((s) => s.maximizedPane)
  const viewportRef = usePanelRef()
  const schematicRef = usePanelRef()

  useEffect(() => {
    const viewport = viewportRef.current
    const schematic = schematicRef.current
    if (!viewport || !schematic) return
    if (maximized === "viewport") {
      viewport.expand()
      schematic.collapse()
    } else if (maximized === "schematic") {
      schematic.expand()
      viewport.collapse()
    } else {
      viewport.expand()
      schematic.expand()
    }
  }, [maximized, orientation, viewportRef, schematicRef])

  return (
    <ResizablePanelGroup
      // A new key per orientation resets the layout instead of reusing stale sizes.
      key={orientation}
      id={`center-split-${orientation}`}
      orientation={orientation}
    >
      <ResizablePanel
        id="viewport"
        panelRef={viewportRef}
        defaultSize="60"
        minSize="20"
        collapsible
        collapsedSize="0"
      >
        <PaneFrame pane="viewport" title="3D View">
          <ViewportPlaceholder />
        </PaneFrame>
      </ResizablePanel>
      <ResizableHandle
        withHandle
        disabled={maximized !== null}
        className={cn(maximized !== null && "hidden")}
      />
      <ResizablePanel
        id="schematic"
        panelRef={schematicRef}
        defaultSize="40"
        minSize="15"
        collapsible
        collapsedSize="0"
      >
        <PaneFrame pane="schematic" title="Schematic">
          <SchematicPlaceholder />
        </PaneFrame>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
