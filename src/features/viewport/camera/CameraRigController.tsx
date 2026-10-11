import { useViewport } from "../ViewportContext"
import { useCameraFrame } from "./useCameraFrame"
import { useControlsLifecycle } from "./useControlsLifecycle"
import { useNavigationInput } from "./useNavigationInput"
import { useProjectionSync } from "./useProjectionSync"
import { useViewportBridge } from "./useViewportBridge"

/** Drives the viewport camera rig (inside the Canvas). Renders nothing. */
export function CameraRigController() {
  const { rig, partsRoot } = useViewport()
  useControlsLifecycle(rig)
  useCameraFrame(rig, partsRoot)
  useProjectionSync(rig, partsRoot)
  useNavigationInput(rig, partsRoot)
  useViewportBridge(rig, partsRoot)
  return null
}
