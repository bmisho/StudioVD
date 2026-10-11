import { Vector3, type OrthographicCamera, type PerspectiveCamera, type Sphere } from "three"
import { orthoStandoff } from "@/core/math/clipPlanes"
import {
  orthographicToPerspective,
  orthoZoomLimits,
  perspectiveToOrthographic,
  poseOnViewAxis,
} from "@/core/math/projection"
import type { CameraRig } from "./createCameraRig"
import { MAX_DISTANCE_MM, MIN_DISTANCE_MM } from "./cameraConfig"

export type Projection = "perspective" | "orthographic"

const forward = new Vector3()
const orbit = new Vector3()

/**
 * Swaps the rig between its two cameras so the target plane looks identical (PLAN §2).
 * The orthographic camera keeps a standoff behind all geometry so its near plane stays
 * positive (moving it along its axis does not change the image).
 */
export function switchProjection(
  rig: CameraRig,
  to: Projection,
  size: { width: number; height: number },
  bounds: Sphere,
  margin: number
): PerspectiveCamera | OrthographicCamera {
  const c = rig.controls
  const from = c.camera
  if ((to === "orthographic") === (from.type === "OrthographicCamera")) return from
  c.stop()
  c.update(0)
  from.getWorldDirection(forward)
  const pose = poseOnViewAxis(from.position, forward, c.getTarget(orbit, false), from.up)
  const T = pose.target

  if (to === "orthographic") {
    const r = perspectiveToOrthographic(
      pose,
      { fovDeg: rig.persp.fov, zoom: rig.persp.zoom },
      size.height
    )
    const o = rig.ortho
    Object.assign(o, {
      left: -size.width / 2,
      right: size.width / 2,
      top: size.height / 2,
      bottom: -size.height / 2,
    })
    o.up.copy(pose.up)
    c.camera = o
    const limits = orthoZoomLimits(size.height, rig.persp.fov, MIN_DISTANCE_MM, MAX_DISTANCE_MM)
    c.minZoom = limits.minZoom
    c.maxZoom = limits.maxZoom
    c.minDistance = 0
    c.maxDistance = Number.POSITIVE_INFINITY
    const standoff = Math.max(T.distanceTo(pose.position), orthoStandoff(T, bounds, margin))
    const p = T.clone().addScaledVector(forward, -standoff)
    void c.setFocalOffset(0, 0, 0, false)
    void c.setLookAt(p.x, p.y, p.z, T.x, T.y, T.z, false)
    void c.zoomTo(r.zoom, false)
  } else {
    const r = orthographicToPerspective(
      pose,
      { zoom: rig.ortho.zoom, frustumHeight: rig.ortho.top - rig.ortho.bottom },
      rig.persp.fov,
      { minDistance: MIN_DISTANCE_MM, maxDistance: MAX_DISTANCE_MM }
    )
    const p = rig.persp
    p.aspect = size.width / size.height
    p.up.copy(pose.up)
    c.camera = p
    c.minZoom = 1
    c.maxZoom = 1
    c.minDistance = MIN_DISTANCE_MM
    c.maxDistance = MAX_DISTANCE_MM
    const pos = r.pose.position
    void c.setFocalOffset(0, 0, 0, false)
    void c.setLookAt(pos.x, pos.y, pos.z, T.x, T.y, T.z, false)
    void c.zoomTo(1, false)
  }
  c.update(0)
  return c.camera
}
