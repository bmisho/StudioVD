import type { RefObject } from "react"
import { useFrame } from "@react-three/fiber"
import { Box3, Sphere, Vector3, type Group } from "three"
import { orthoClipPlanes, orthoStandoff, perspectiveClipPlanes } from "@/core/math/clipPlanes"
import { gridFadeRadiusMm, type ViewSpec } from "@/core/math/gridLevels"
import type { CameraRig } from "./createCameraRig"
import { CLIP_MAX_RATIO, MAX_FRAME_DELTA_S, MIN_NEAR_MM } from "./cameraConfig"
import { clipMargin } from "./fitView"
import { viewBounds, visiblePartsBox } from "./sceneBounds"

// Reused every frame: no allocation in the render loop.
const box = new Box3()
const bounds = new Sphere()
const grid = new Sphere()
const target = new Vector3()
const forward = new Vector3()

export function viewSpecOf(rig: CameraRig): ViewSpec {
  const cam = rig.controls.camera
  return cam.type === "OrthographicCamera"
    ? {
        kind: "orthographic",
        frustumHeight: rig.ortho.top - rig.ortho.bottom,
        zoom: rig.ortho.zoom,
      }
    : { kind: "perspective", fovDeg: rig.persp.fov, distanceMm: rig.controls.distance }
}

/**
 * Before every rendered frame (priority -1): advances the controls, keeps the orthographic
 * standoff behind all geometry, and fits near/far to the parts plus the visible grid.
 */
export function useCameraFrame(rig: CameraRig, partsRoot: RefObject<Group | null>): void {
  useFrame((state, delta) => {
    const c = rig.controls
    c.update(Math.min(delta, MAX_FRAME_DELTA_S))
    const cam = c.camera
    c.getTarget(target)
    const aspect = state.size.width / Math.max(1, state.size.height)
    grid.center.set(target.x, 0, target.z)
    grid.radius = gridFadeRadiusMm(viewSpecOf(rig), aspect)
    viewBounds(visiblePartsBox(partsRoot.current, box), grid, bounds)

    let planes: { near: number; far: number }
    if (cam.type === "OrthographicCamera") {
      const margin = clipMargin(bounds.radius)
      const need = orthoStandoff(target, bounds, margin)
      if (c.distance < need) {
        c.distance = need
        c.update(0)
      }
      cam.getWorldDirection(forward)
      planes = orthoClipPlanes(cam.position, forward, bounds, c.distance, margin)
    } else {
      planes = perspectiveClipPlanes(cam.position, bounds, c.distance, {
        maxRatio: CLIP_MAX_RATIO,
        minNear: MIN_NEAR_MM,
      })
    }
    const changed =
      Math.abs(planes.near - cam.near) > 0.01 * cam.near ||
      Math.abs(planes.far - cam.far) > 0.01 * cam.far
    if (changed) {
      cam.near = planes.near
      cam.far = planes.far
      cam.updateProjectionMatrix()
    }
  }, -1)
}
