import { useEffect, type RefObject } from "react"
import { useThree } from "@react-three/fiber"
import { Vector2, type Group } from "three"
import { NAVIGATION_PRESETS } from "@/core/navigation/mousePresets"
import { usePreferencesStore } from "@/store/preferences/preferencesStore"
import { openViewportContextMenu } from "../picking/viewportContextMenu"
import { viewportBridge } from "../viewportBridge"
import { applyZoomSettings } from "./applyNavigation"
import type { CameraRig } from "./createCameraRig"
import { attachNavigationInput } from "./navigationInput"
import { eventElement } from "./useControlsLifecycle"

const ndc = new Vector2()

/** Mouse navigation per the chosen preset; re-applies zoom settings when preferences change. */
export function useNavigationInput(rig: CameraRig, partsRoot: RefObject<Group | null>): void {
  const connected = useThree((s): unknown => s.events.connected)
  const gl = useThree((s) => s.gl)
  const get = useThree((s) => s.get)

  useEffect(() => {
    const el = eventElement(connected, gl.domElement)
    const preset = () => NAVIGATION_PRESETS[usePreferencesStore.getState().navigationPreset]
    const applyZoom = () =>
      applyZoomSettings(rig.controls, preset(), usePreferencesStore.getState())
    applyZoom()
    const unsubscribe = usePreferencesStore.subscribe(applyZoom)
    const detach = attachNavigationInput(el, rig.controls, {
      getPreset: preset,
      pickPoint: (clientX, clientY) => {
        const root = partsRoot.current
        if (!root) return null
        const rect = el.getBoundingClientRect()
        ndc.set(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1
        )
        const { raycaster, camera } = get()
        raycaster.setFromCamera(ndc, camera)
        return raycaster.intersectObject(root, true)[0]?.point ?? null
      },
      onMiddleDoubleClick: () => viewportBridge.fitAll(),
      onContextMenuRequest: openViewportContextMenu,
    })
    return () => {
      detach()
      unsubscribe()
    }
  }, [rig, partsRoot, connected, gl, get])
}
