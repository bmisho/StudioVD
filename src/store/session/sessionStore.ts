import { create } from "zustand"
import type {
  AnchorId,
  BlockDefId,
  ComponentInstanceId,
  ConnectorId,
  EdgeId,
  GroupId,
  MateId,
  MateType,
  NodeId,
  PartId,
} from "@/core/schema"

// Session state (CLAUDE.md §4, kind 2): not persisted, not undoable.

export type Tool = "select" | "anchor" | "mate"
export type Projection = "perspective" | "orthographic"
export type SplitOrientation = "horizontal" | "vertical"
export type Pane = "viewport" | "schematic"
export type SimStatus = "idle" | "solving" | "error"
export type DialogId = "about" | "credits"
export type GizmoMode = "translate" | "rotate"
/** How parts are drawn (PLAN 6.6). Wireframe shows feature edges only, not the triangles. */
export type DisplayMode = "shaded" | "shadedEdges" | "wireframe" | "xray"
export const DISPLAY_MODES: readonly DisplayMode[] = ["shaded", "shadedEdges", "wireframe", "xray"]
/** WebGL context of the 3D view: not created yet (e.g. the pane is collapsed), working, or lost. */
export type ViewportGpu = "starting" | "ready" | "lost"

export type SelectionItem =
  | { kind: "group"; id: GroupId }
  | { kind: "part"; id: PartId }
  | { kind: "anchor"; id: AnchorId }
  | { kind: "mate"; id: MateId }
  | { kind: "node"; id: NodeId }
  | { kind: "edge"; id: EdgeId }
  | { kind: "connector"; id: ConnectorId }

/** The Mate tool's picks so far (PLAN 8.2): anchor A, then B with the new mate's options. */
export interface MateDraft {
  anchorA: AnchorId
  anchorB: AnchorId | null
  type: MateType
  flip: boolean
  angleOffsetRad: number
}

export interface SessionState {
  selection: SelectionItem[]
  /** The component double-clicked into: its parts are picked one by one (PLAN 9.5). */
  enteredComponent: ComponentInstanceId | null
  activeTool: Tool
  /** While the Mate tool is on: what it has picked. Cleared when the tool ends. */
  mateDraft: MateDraft | null
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
  /** The block definition open in the black-box editor (PLAN 11.5). */
  blockEditor: BlockDefId | null
  viewportGpu: ViewportGpu
  /** View > Isolate: only these parts are drawn (a view filter, not a document change). */
  isolated: readonly PartId[] | null
  /** What the transform gizmo on a selected part does. */
  gizmoMode: GizmoMode
  displayMode: DisplayMode

  select: (items: SelectionItem[]) => void
  enterComponent: (id: ComponentInstanceId | null) => void
  /** Ctrl+click / Ctrl+Space: adds the item to the selection or removes it. */
  toggleSelected: (item: SelectionItem) => void
  clearSelection: () => void
  setTool: (tool: Tool) => void
  setMateDraft: (draft: MateDraft | null) => void
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
  openBlockEditor: (id: BlockDefId | null) => void
  closeDialog: () => void
  setViewportGpu: (state: ViewportGpu) => void
  /** Isolates `ids`; when already isolating (or `ids` is empty), shows everything again. */
  toggleIsolation: (ids: readonly PartId[]) => void
  setGizmoMode: (mode: GizmoMode) => void
  setDisplayMode: (mode: DisplayMode) => void
  /** Another document replaced the open one (New, Open): drop what pointed into the old. */
  resetForDocument: () => void
}

export const initialSessionState = {
  selection: [],
  enteredComponent: null,
  activeTool: "select",
  mateDraft: null,
  projection: "perspective",
  splitOrientation: "horizontal",
  maximizedPane: null,
  leftPanelOpen: true,
  rightPanelOpen: true,
  testMode: false,
  testRun: 0,
  simStatus: "idle",
  dialog: null,
  blockEditor: null,
  viewportGpu: "starting",
  isolated: null,
  gizmoMode: "translate",
  displayMode: "shaded",
} satisfies Partial<SessionState>

export function createSessionStore() {
  return create<SessionState>()((set) => ({
    ...initialSessionState,

    select: (items) => set({ selection: items }),
    enterComponent: (enteredComponent) => set({ enteredComponent }),
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
    setTool: (tool) =>
      set((s) => ({ activeTool: tool, mateDraft: tool === "mate" ? s.mateDraft : null })),
    setMateDraft: (mateDraft) => set({ mateDraft }),
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
    // Tools edit the design pose: entering test mode ends them.
    toggleTestMode: () =>
      set((s) =>
        s.testMode ? { testMode: false } : { testMode: true, activeTool: "select", mateDraft: null }
      ),
    resetForDocument: () =>
      set({
        selection: [],
        enteredComponent: null,
        isolated: null,
        testMode: false,
        activeTool: "select",
        mateDraft: null,
        blockEditor: null,
      }),
    restartTestMode: () => set((s) => (s.testMode ? { testRun: s.testRun + 1 } : {})),
    openDialog: (dialog) => set({ dialog }),
    openBlockEditor: (blockEditor) => set({ blockEditor }),
    closeDialog: () => set({ dialog: null }),
    setViewportGpu: (viewportGpu) => set({ viewportGpu }),
    toggleIsolation: (ids) =>
      set((s) => ({ isolated: s.isolated !== null || ids.length === 0 ? null : [...ids] })),
    setGizmoMode: (gizmoMode) => set({ gizmoMode }),
    setDisplayMode: (displayMode) => set({ displayMode }),
  }))
}

export type SessionStore = ReturnType<typeof createSessionStore>

export const useSessionStore = createSessionStore()
