import { Sphere, Spherical, Vector3, type Box3 } from "three"
import { orthoStandoff } from "@/core/math/clipPlanes"
import { basisFromQuaternion, fitBoxOrthographic, fitBoxPerspective } from "@/core/math/viewFit"
import { nearestAzimuth } from "@/core/math/standardViews"
import type { CameraRig } from "./createCameraRig"
import { DEFAULT_STAGE, FIT_PADDING, MAX_DISTANCE_MM, MIN_DISTANCE_MM } from "./cameraConfig"

const sphere = new Sphere()
const spherical = new Spherical()

/** Clip margin: 1 mm or 2 % of the radius. */
export const clipMargin = (radius: number) => Math.max(1, 0.02 * radius)

/** Frames the visible parts in the current view direction (camera-controls' fitToBox snaps to an axis). */
export async function fitAll(
  rig: CameraRig,
  partsBox: Box3,
  size: { width: number; height: number },
  animate: boolean
): Promise<void> {
  const c = rig.controls
  const box = partsBox.isEmpty() ? DEFAULT_STAGE : partsBox
  const cam = c.camera
  c.stop()
  c.update(0) // apply pending moves, so the camera's orientation is current
  const basis = basisFromQuaternion(cam.quaternion)
  const aspect = size.width / size.height
  if (cam.type === "PerspectiveCamera") {
    const f = fitBoxPerspective(box, basis, { fovDeg: rig.persp.fov, aspect, padding: FIT_PADDING })
    const d = Math.min(MAX_DISTANCE_MM, Math.max(MIN_DISTANCE_MM, f.distance))
    const p = f.target.clone().addScaledVector(basis.forward, -d)
    await Promise.all([
      c.setFocalOffset(0, 0, 0, animate),
      c.setLookAt(p.x, p.y, p.z, f.target.x, f.target.y, f.target.z, animate),
    ])
  } else {
    const o = fitBoxOrthographic(box, basis, aspect, FIT_PADDING)
    box.getBoundingSphere(sphere)
    const standoff = orthoStandoff(o.target, sphere, clipMargin(sphere.radius))
    const p = o.target.clone().addScaledVector(basis.forward, -standoff)
    await Promise.all([
      c.setFocalOffset(0, 0, 0, animate),
      c.setLookAt(p.x, p.y, p.z, o.target.x, o.target.y, o.target.z, animate),
      c.zoomTo(size.height / o.visibleHeight, animate),
    ])
  }
}

/** Turns the view to look along `direction` (target to camera), keeping target and distance. */
export async function setViewDirection(
  rig: CameraRig,
  direction: readonly [number, number, number],
  animate: boolean
): Promise<void> {
  const c = rig.controls
  spherical.setFromVector3(new Vector3(...direction))
  c.normalizeRotations()
  await c.rotateTo(nearestAzimuth(c.azimuthAngle, spherical.theta), spherical.phi, animate)
}
