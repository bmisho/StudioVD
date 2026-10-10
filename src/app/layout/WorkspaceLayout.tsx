import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { LeftSidebar } from "@/app/sidebars/LeftSidebar"
import { RightSidebar } from "@/app/sidebars/RightSidebar"
import { useSessionStore } from "@/store/session/sessionStore"
import { CenterSplit } from "./CenterSplit"
import { PanelErrorBoundary } from "./PanelErrorBoundary"

// react-resizable-panels v4: numbers are pixels, unit-less strings are percentages.
const SIDEBAR = { left: 280, right: 300, min: 220, max: 480 }

/** Left sidebar | 3D + schematic | right sidebar. Sidebars keep a pixel width. */
export function WorkspaceLayout() {
  const leftOpen = useSessionStore((s) => s.leftPanelOpen)
  const rightOpen = useSessionStore((s) => s.rightPanelOpen)

  return (
    <ResizablePanelGroup
      // Remount when sidebars are toggled so the remaining panels re-flow cleanly.
      key={`${leftOpen}-${rightOpen}`}
      id="workspace"
      orientation="horizontal"
      className="min-h-0 flex-1"
    >
      {leftOpen && (
        <>
          <ResizablePanel
            id="left-sidebar"
            defaultSize={SIDEBAR.left}
            minSize={SIDEBAR.min}
            maxSize={SIDEBAR.max}
          >
            <PanelErrorBoundary panelName="Scene & Library">
              <LeftSidebar />
            </PanelErrorBoundary>
          </ResizablePanel>
          <ResizableHandle />
        </>
      )}
      <ResizablePanel id="center" minSize="30">
        <CenterSplit />
      </ResizablePanel>
      {rightOpen && (
        <>
          <ResizableHandle />
          <ResizablePanel
            id="right-sidebar"
            defaultSize={SIDEBAR.right}
            minSize={SIDEBAR.min}
            maxSize={SIDEBAR.max}
          >
            <PanelErrorBoundary panelName="Properties">
              <RightSidebar />
            </PanelErrorBoundary>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}
