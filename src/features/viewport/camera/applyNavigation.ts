import { CameraControlsImpl } from "@react-three/drei"
import {
  zoomSigns,
  type MouseButtonName,
  type NavAction,
  type NavigationPreset,
} from "@/core/navigation/mousePresets"

type MouseAction = CameraControlsImpl["mouseButtons"]["middle"]

/** zoom = DOLLY in perspective (moves the camera), ZOOM in orthographic (scales the view). */
export function toCameraAction(action: NavAction, ortho: boolean): MouseAction {
  const A = CameraControlsImpl.ACTION
  switch (action) {
    case "orbit":
      return A.ROTATE
    case "pan":
      return A.TRUCK
    case "zoom":
      return ortho ? A.ZOOM : A.DOLLY
    case "none":
      return A.NONE
  }
}

export function applyButtons(
  controls: CameraControlsImpl,
  buttons: Record<MouseButtonName, NavAction>
): void {
  const ortho = controls.camera.type === "OrthographicCamera"
  controls.mouseButtons.left = toCameraAction(buttons.left, ortho)
  controls.mouseButtons.middle = toCameraAction(buttons.middle, ortho)
  controls.mouseButtons.right = toCameraAction(buttons.right, ortho)
}

export interface ZoomPrefs {
  zoomToCursor: boolean
  zoomSpeed: number
}

/** The wheel action is set once by camera-controls' constructor, so re-apply it per camera. */
export function applyZoomSettings(
  controls: CameraControlsImpl,
  preset: NavigationPreset,
  prefs: ZoomPrefs
): void {
  const A = CameraControlsImpl.ACTION
  controls.mouseButtons.wheel = controls.camera.type === "OrthographicCamera" ? A.ZOOM : A.DOLLY
  const { dollySpeed, dollyDragInverted } = zoomSigns(preset, prefs.zoomSpeed)
  controls.dollySpeed = dollySpeed
  controls.dollyDragInverted = dollyDragInverted
  controls.dollyToCursor = prefs.zoomToCursor
}
