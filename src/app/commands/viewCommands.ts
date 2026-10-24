import type { Command, CommandDeps } from "./types"

export function viewCommands({
  session,
  viewport,
  openDialog,
  focusMenuBar,
}: CommandDeps): Command[] {
  const s = () => session.getState()
  return [
    {
      id: "view.fitAll",
      label: "Fit All",
      shortcuts: ["F", "Home"],
      run: () => viewport.fitAll(),
      isEnabled: () => viewport.isReady(),
    },
    {
      id: "view.toggleProjection",
      label: "Orthographic Projection",
      run: () => s().toggleProjection(),
      isChecked: () => s().projection === "orthographic",
    },
    {
      id: "view.toggleSplit",
      label: "Stack 3D and Schematic Vertically",
      run: () => s().toggleSplitOrientation(),
      isChecked: () => s().splitOrientation === "vertical",
    },
    {
      id: "view.maximizeViewport",
      label: "Maximize 3D View",
      run: () => s().toggleMaximize("viewport"),
      isChecked: () => s().maximizedPane === "viewport",
    },
    {
      id: "view.maximizeSchematic",
      label: "Maximize Schematic",
      run: () => s().toggleMaximize("schematic"),
      isChecked: () => s().maximizedPane === "schematic",
    },
    {
      id: "view.toggleLeftPanel",
      label: "Scene & Library Panel",
      run: () => s().toggleLeftPanel(),
      isChecked: () => s().leftPanelOpen,
    },
    {
      id: "view.toggleRightPanel",
      label: "Properties Panel",
      run: () => s().toggleRightPanel(),
      isChecked: () => s().rightPanelOpen,
    },
    {
      id: "view.focusMenuBar",
      label: "Focus Menu Bar",
      shortcuts: ["F10"],
      allowInTextInput: true,
      run: focusMenuBar,
    },
    { id: "tool.select", label: "Select", run: () => s().setTool("select") },
    {
      id: "tool.anchor",
      label: "Place Anchor",
      run: () => s().setTool("anchor"),
      // Anchors are placed on the design pose, not on parts moving in test mode.
      isEnabled: () => !s().testMode,
      disabledReason: "leave test mode first",
    },
    {
      id: "tool.mate",
      label: "Mate",
      run: () => s().setTool("mate"),
      // Mates snap parts at their design pose, not while test mode moves them.
      isEnabled: () => !s().testMode,
      disabledReason: "leave test mode first",
    },
    { id: "help.about", label: "About StudioVD", run: () => openDialog("about") },
  ]
}
