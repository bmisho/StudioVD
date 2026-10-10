import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { LeftSidebar } from "@/app/sidebars/LeftSidebar"
import { RightSidebar } from "@/app/sidebars/RightSidebar"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/store/session/sessionStore"
import { CenterSplit } from "./CenterSplit"
import { PanelErrorBoundary } from "./PanelErrorBoundary"
import { useCollapsiblePanel } from "./useCollapsiblePanel"

// react-resizable-panels v4: numbers are pixels, unit-less strings are percentages.
const SIDEBAR = { left: 280, right: 300, min: 220, max: 480 }

/**
 * Left sidebar | 3D + schematic | right sidebar. Sidebars are always mounted and collapse to
 * zero width, so toggling them never remounts the centre or loses sizes and tabs.
 */
export function WorkspaceLayout() {
  const leftOpen = useSessionStore((s) => s.leftPanelOpen)
  const rightOpen = useSessionStore((s) => s.rightPanelOpen)
  const setPanelOpen = useSessionStore((s) => s.setPanelOpen)
  const left = useCollapsiblePanel(leftOpen, {
    unit: "px",
    onDragToggle: (open) => setPanelOpen("left", open),
  })
  const right = useCollapsiblePanel(rightOpen, {
    unit: "px",
    onDragToggle: (open) => setPanelOpen("right", open),
  })

  return (
    <ResizablePanelGroup id="workspace" orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel
        id="left-sidebar"
        panelRef={left.panelRef}
        onResize={left.onResize}
        defaultSize={SIDEBAR.left}
        minSize={SIDEBAR.min}
        maxSize={SIDEBAR.max}
        collapsible
        collapsedSize={0}
      >
        {/* Collapsed: out of view, the tab order and the accessibility tree, still mounted. */}
        <div className="h-full" inert={left.collapsed} hidden={left.collapsed}>
          <PanelErrorBoundary panelName="Scene & Library">
            <LeftSidebar />
          </PanelErrorBoundary>
        </div>
      </ResizablePanel>
      <ResizableHandle
        aria-label="Resize the scene and library panel"
        disabled={left.collapsed}
        className={cn(left.collapsed && "hidden")}
      />
      <ResizablePanel id="center" minSize="30">
        <main aria-label="Workspace" className="h-full select-none">
          <CenterSplit />
        </main>
      </ResizablePanel>
      <ResizableHandle
        aria-label="Resize the properties panel"
        disabled={right.collapsed}
        className={cn(right.collapsed && "hidden")}
      />
      <ResizablePanel
        id="right-sidebar"
        panelRef={right.panelRef}
        onResize={right.onResize}
        defaultSize={SIDEBAR.right}
        minSize={SIDEBAR.min}
        maxSize={SIDEBAR.max}
        collapsible
        collapsedSize={0}
      >
        <div className="h-full" inert={right.collapsed} hidden={right.collapsed}>
          <PanelErrorBoundary panelName="Properties">
            <RightSidebar />
          </PanelErrorBoundary>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
