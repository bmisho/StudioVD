import { STANDARD_VIEW_DIRECTIONS, type StandardView } from "@/core/math/standardViews"
import { NAVIGATION_PRESET_IDS, NAVIGATION_PRESETS } from "@/core/navigation/mousePresets"
import type { Command, CommandDeps } from "./types"

// SolidWorks standard-view shortcuts (Ctrl+8 "Normal To" needs face selection: Phase 7).
const VIEWS: readonly (readonly [StandardView, string, string])[] = [
  ["front", "Front", "Ctrl+1"],
  ["back", "Back", "Ctrl+2"],
  ["left", "Left", "Ctrl+3"],
  ["right", "Right", "Ctrl+4"],
  ["top", "Top", "Ctrl+5"],
  ["bottom", "Bottom", "Ctrl+6"],
  ["isometric", "Isometric", "Ctrl+7"],
]

/** Standard views (keyboard and menu parity with the canvas-only view cube). */
export function viewOrientationCommands({ viewport }: CommandDeps): Command[] {
  return VIEWS.map(([view, label, combo]) => ({
    id: `view.orient.${view}` as const,
    label,
    shortcuts: [combo],
    run: () => viewport.setView(STANDARD_VIEW_DIRECTIONS[view]),
    isEnabled: () => viewport.isReady(),
  }))
}

/** Mouse navigation presets, shown as a radio group. */
export function navigationCommands({ preferences }: CommandDeps): Command[] {
  return NAVIGATION_PRESET_IDS.map((id) => ({
    id: `view.navigation.${id}` as const,
    label: NAVIGATION_PRESETS[id].label,
    run: () => preferences.getState().setNavigationPreset(id),
    isChecked: () => preferences.getState().navigationPreset === id,
  }))
}
