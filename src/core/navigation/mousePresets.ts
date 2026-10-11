// Mouse navigation presets as data (PLAN 3.4). The left button is reserved for picking and
// part drags in every preset. Alt is never bound: several Linux window managers own Alt+drag.

export type NavAction = "none" | "orbit" | "pan" | "zoom"
export type MouseButtonName = "left" | "middle" | "right"
export type NavigationPresetId = "solidworks" | "fusion" | "onshape" | "blender"

export interface Modifiers {
  ctrl: boolean
  shift: boolean
  alt: boolean
}

export interface DragBinding {
  button: MouseButtonName
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  action: NavAction
}

export interface NavigationPreset {
  id: NavigationPresetId
  label: string
  drags: readonly DragBinding[]
  /** Wheel rolled towards the user zooms in (SolidWorks) instead of out. */
  wheelTowardUserZoomsIn: boolean
  /** A zoom drag moving the mouse up zooms in. */
  dragUpZoomsIn: boolean
  middleDoubleClickFits: boolean
  /** Orbit around the orbit target, or around the surface point under the cursor. */
  orbitPivot: "target" | "cursor"
}

// Sources: vendor docs as of 2026; details marked unverified in PLAN.md are one-line fixes.
export const NAVIGATION_PRESETS: Readonly<Record<NavigationPresetId, NavigationPreset>> = {
  solidworks: {
    id: "solidworks",
    label: "SolidWorks",
    drags: [
      { button: "middle", action: "orbit" },
      { button: "middle", ctrl: true, action: "pan" },
      { button: "middle", shift: true, action: "zoom" },
    ],
    wheelTowardUserZoomsIn: true,
    dragUpZoomsIn: true,
    middleDoubleClickFits: true,
    orbitPivot: "target",
  },
  fusion: {
    id: "fusion",
    label: "Fusion 360",
    drags: [
      { button: "middle", action: "pan" },
      { button: "middle", shift: true, action: "orbit" },
      { button: "middle", ctrl: true, shift: true, action: "zoom" },
    ],
    wheelTowardUserZoomsIn: false,
    dragUpZoomsIn: true,
    middleDoubleClickFits: true,
    orbitPivot: "target",
  },
  onshape: {
    id: "onshape",
    label: "Onshape",
    drags: [
      { button: "right", action: "orbit" },
      { button: "right", ctrl: true, action: "pan" },
      { button: "middle", action: "pan" },
    ],
    wheelTowardUserZoomsIn: false,
    dragUpZoomsIn: true,
    middleDoubleClickFits: false,
    orbitPivot: "cursor",
  },
  blender: {
    id: "blender",
    label: "Blender",
    drags: [
      { button: "middle", action: "orbit" },
      { button: "middle", shift: true, action: "pan" },
      { button: "middle", ctrl: true, action: "zoom" },
    ],
    wheelTowardUserZoomsIn: false,
    dragUpZoomsIn: true,
    middleDoubleClickFits: false,
    orbitPivot: "target",
  },
}

export const NAVIGATION_PRESET_IDS = Object.keys(NAVIGATION_PRESETS) as NavigationPresetId[]

const BUTTONS: readonly MouseButtonName[] = ["left", "middle", "right"]

function matches(binding: DragBinding, m: Modifiers): boolean {
  return (
    (binding.ctrl ?? false) === m.ctrl &&
    (binding.shift ?? false) === m.shift &&
    (binding.alt ?? false) === m.alt
  )
}

/** Exact modifier match wins, then the button's unmodified binding, else "none". */
export function resolveButtons(
  preset: NavigationPreset,
  m: Modifiers
): Record<MouseButtonName, NavAction> {
  const result = { left: "none", middle: "none", right: "none" } as Record<
    MouseButtonName,
    NavAction
  >
  for (const button of BUTTONS) {
    if (button === "left") continue // reserved for picking and part drags
    const own = preset.drags.filter((b) => b.button === button)
    const exact = own.find((b) => matches(b, m))
    const plain = own.find((b) => matches(b, { ctrl: false, shift: false, alt: false }))
    result[button] = (exact ?? plain)?.action ?? "none"
  }
  return result
}

/**
 * camera-controls zooms OUT for wheel deltaY > 0 and for a zoom drag moving up. A negative
 * dollySpeed flips both; dollyDragInverted flips only the drag.
 */
export function zoomSigns(
  preset: NavigationPreset,
  speed = 1
): { dollySpeed: number; dollyDragInverted: boolean } {
  const dollySpeed = preset.wheelTowardUserZoomsIn ? -speed : speed
  const dragUpZoomsInByDefault = dollySpeed < 0
  return { dollySpeed, dollyDragInverted: dragUpZoomsInByDefault !== preset.dragUpZoomsIn }
}
