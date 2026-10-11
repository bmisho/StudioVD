import { useEffect, useLayoutEffect, type RefObject } from "react"
import { useThree } from "@react-three/fiber"
import { Box3, Sphere, type Group } from "three"
import { NAVIGATION_PRESETS } from "@/core/navigation/mousePresets"
import { orthoZoomLimits } from "@/core/math/projection"
import { usePreferencesStore } from "@/store/preferences/preferencesStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { applyZoomSettings } from "./applyNavigation"
import type { CameraRig } from "./createCameraRig"
import { MAX_DISTANCE_MM, MIN_DISTANCE_MM } from "./cameraConfig"
import { clipMargin } from "./fitView"
import { viewBounds, visiblePartsBox } from "./sceneBounds"
import { switchProjection } from "./switchProjection"

/** Session projection -> camera swap (the Canvas `orthographic` prop is read only once). */
export function useProjectionSync(rig: CameraRig, partsRoot: RefObject<Group | null>): void {
  const projection = useSessionStore((s) => s.projection)
  const set = useThree((s) => s.set)
  const get = useThree((s) => s.get)
  const invalidate = useThree((s) => s.invalidate)
  const height = useThree((s) => s.size.height)

  useLayoutEffect(() => {
    const isOrtho = rig.controls.camera.type === "OrthographicCamera"
    if ((projection === "orthographic") === isOrtho) return
    const size = get().size
    const bounds = viewBounds(visiblePartsBox(partsRoot.current, new Box3()), null, new Sphere())
    const camera = switchProjection(rig, projection, size, bounds, clipMargin(bounds.radius))
    const prefs = usePreferencesStore.getState()
    applyZoomSettings(rig.controls, NAVIGATION_PRESETS[prefs.navigationPreset], prefs)
    set({ camera })
    invalidate()
  }, [projection, rig, partsRoot, set, get, invalidate])

  // Ortho zoom limits mirror the dolly limits, and those depend on the pane height.
  useEffect(() => {
    if (rig.controls.camera.type !== "OrthographicCamera" || height <= 0) return
    const limits = orthoZoomLimits(height, rig.persp.fov, MIN_DISTANCE_MM, MAX_DISTANCE_MM)
    rig.controls.minZoom = limits.minZoom
    rig.controls.maxZoom = limits.maxZoom
  }, [rig, height, projection])
}
