import { CameraControlsImpl } from "@react-three/drei"
import {
  Box3,
  MathUtils,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from "three"
import {
  CAMERA_FOV_DEG,
  DRAG_SMOOTH_TIME_S,
  HOME_DIRECTION,
  MAX_DISTANCE_MM,
  MIN_DISTANCE_MM,
  SMOOTH_TIME_S,
} from "./cameraConfig"

/**
 * Both cameras and ONE controls instance for the canvas lifetime. drei's <CameraControls>
 * rebuilds the controls whenever the default camera changes, which loses the target and
 * resets the left button to orbit; switching projection here only swaps `controls.camera`.
 */
export interface CameraRig {
  persp: PerspectiveCamera
  ortho: OrthographicCamera
  controls: CameraControlsImpl
}

let installed = false

export function createCameraRig(): CameraRig {
  if (!installed) {
    // camera-controls takes the subset of three it uses, so the bundle can tree-shake.
    CameraControlsImpl.install({
      THREE: {
        Box3,
        MathUtils: { clamp: MathUtils.clamp },
        Matrix4,
        Quaternion,
        Raycaster,
        Sphere,
        Spherical,
        Vector2,
        Vector3,
        Vector4,
      },
    })
    installed = true
  }
  const persp = new PerspectiveCamera(CAMERA_FOV_DEG, 1, 1, 1e5)
  const ortho = new OrthographicCamera(-1, 1, 1, -1, 1, 1e5)
  const controls = new CameraControlsImpl(persp) // connected later, to R3F's event element
  controls.smoothTime = SMOOTH_TIME_S
  controls.draggingSmoothTime = DRAG_SMOOTH_TIME_S
  controls.minDistance = MIN_DISTANCE_MM
  controls.maxDistance = MAX_DISTANCE_MM
  // Perspective zoom stays 1, or h = 2 d tan(θ/2) breaks (Ctrl+wheel is hard-wired to zoom).
  controls.minZoom = 1
  controls.maxZoom = 1
  controls.dollyToCursor = true
  controls.infinityDolly = true
  const A = CameraControlsImpl.ACTION
  controls.mouseButtons.left = A.NONE // reserved for picking and part drags
  controls.mouseButtons.middle = A.ROTATE
  controls.mouseButtons.right = A.NONE
  controls.mouseButtons.wheel = A.DOLLY
  const p = HOME_DIRECTION.clone().multiplyScalar(600)
  void controls.setLookAt(p.x, p.y, p.z, 0, 50, 0, false)
  controls.update(0) // camera-controls only moves the camera on update()
  return { persp, ortho, controls }
}
