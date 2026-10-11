import { create } from "zustand"
import type { GroupId, MateId, NodeId, PartId } from "@/core/schema"

// Session state (CLAUDE.md §4, kind 2): not persisted, not undoable.

export type Tool = "select" | "anchor" | "mate"
export type Projection = "perspective" | "orthographic"
export type SplitOrientation = "horizontal" | "vertical"
export type Pane = "viewport" | "schematic"
export type SimStatus = "idle" | "solving" | "error"
export type DialogId = "about"
/** WebGL context of the 3D view: not created yet (e.g. the pane is collapsed), working, or lost. */
export type ViewportGpu = "starting" | "ready" | "lost"

export type SelectionItem =
  | { kind: "group"; id: GroupId }
  | { kind: "part"; id: PartId }
  | { kind: "mate"; id: MateId }
  | { kind: "node"; id: NodeId }

export interface SessionState {
  selection: SelectionItem[]
  activeTool: Tool
  projection: Projection
  splitOrientation: SplitOrientation
  maximizedPane: Pane | null
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  testMode: boolean
  /** Bumped by "Reset to Design Pose": the physics world restarts from the design pose. */
  testRun: number
  simStatus: SimStatus
  /** Modal dialog currently open, if any. */
  dialog: DialogId | null
  viewportGpu: ViewportGpu

  select: (items: SelectionItem[]) => void
  /** Ctrl+click / Ctrl+Space: adds the item to the selection or removes it. */
  toggleSelected: (item: SelectionItem) => void
  clearSelection: () => void
  setTool: (tool: Tool) => void
  toggleProjection: () => void
  toggleSplitOrientation: () => void
  /** Maximizes `pane`, or restores the split if it is already maximized. */
  toggleMaximize: (pane: Pane) => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  /** Syncs state when the user collapses or re-opens a sidebar by dragging its edge. */
  setPanelOpen: (side: "left" | "right", open: boolean) => void
  toggleTestMode: () => void
  restartTestMode: () => void
  openDialog: (dialog: DialogId) => void
  closeDialog: () => void
  setViewportGpu: (state: ViewportGpu) => void
}

export const initialSessionState = {
  selection: [],
  activeTool: "select",
  projection: "perspective",
  splitOrientation: "horizontal",
  maximizedPane: null,
  leftPanelOpen: true,
  rightPanelOpen: true,
  testMode: false,
  testRun: 0,
  simStatus: "idle",
  dialog: null,
  viewportGpu: "starting",
} satisfies Partial<SessionState>

export function createSessionStore() {
  return create<SessionState>()((set) => ({
    ...initialSessionState,

    select: (items) => set({ selection: items }),
    toggleSelected: (item) =>
      set((s) => {
        const present = s.selection.some((i) => i.kind === item.kind && i.id === item.id)
        return {
          selection: present
            ? s.selection.filter((i) => !(i.kind === item.kind && i.id === item.id))
            : [...s.selection, item],
        }
      }),
    clearSelection: () => set({ selection: [] }),
    setTool: (tool) => set({ activeTool: tool }),
    toggleProjection: () =>
      set((s) => ({
        projection: s.projection === "perspective" ? "orthographic" : "perspective",
      })),
    toggleSplitOrientation: () =>
      set((s) => ({
        splitOrientation: s.splitOrientation === "horizontal" ? "vertical" : "horizontal",
      })),
    toggleMaximize: (pane) =>
      set((s) => ({ maximizedPane: s.maximizedPane === pane ? null : pane })),
    toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
    toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
    setPanelOpen: (side, open) =>
      set(side === "left" ? { leftPanelOpen: open } : { rightPanelOpen: open }),
    toggleTestMode: () => set((s) => ({ testMode: !s.testMode })),
    restartTestMode: () => set((s) => (s.testMode ? { testRun: s.testRun + 1 } : {})),
    openDialog: (dialog) => set({ dialog }),
    closeDialog: () => set({ dialog: null }),
    setViewportGpu: (viewportGpu) => set({ viewportGpu }),
  }))
}

export type SessionStore = ReturnType<typeof createSessionStore>

export const useSessionStore = createSessionStore()
