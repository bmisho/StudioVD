import type { Vector3 } from "three"

// Perspective <-> orthographic framing (PLAN §2). Units: mm for lengths, degrees for the
// vertical field of view, CSS px for the orthographic frustum (R3F sizes it to ±size/2).

const DEG = Math.PI / 180

/** A camera pose whose target lies on its view axis. */
export interface ViewPose {
  position: Vector3
  target: Vector3
  up: Vector3
}

/** Visible height of the target plane at distance d: h = 2 d tan(θ/2) / zoom. */
export function visibleHeightAtDistance(distance: number, fovDeg: number, zoom = 1): number {
  return (2 * distance * Math.tan((fovDeg * DEG) / 2)) / zoom
}

/** Inverse of {@link visibleHeightAtDistance}: d = h zoom / (2 tan(θ/2)). */
export function distanceForVisibleHeight(height: number, fovDeg: number, zoom = 1): number {
  return (height * zoom) / (2 * Math.tan((fovDeg * DEG) / 2))
}

/** Orthographic visible height: (top − bottom) / zoom. */
export function orthoVisibleHeight(frustumHeight: number, zoom: number): number {
  return frustumHeight / zoom
}

/** Orthographic zoom that shows `height` mm over a frustum `frustumHeight` px tall. */
export function orthoZoomForVisibleHeight(frustumHeight: number, height: number): number {
  return frustumHeight / height
}

/**
 * Moves the orbit point onto the view axis without changing the image: camera-controls can
 * orbit around a point off the axis (a focal offset), which the conversions must not see.
 * target' = P + f ((T − P) · f), with f the unit forward direction.
 */
export function poseOnViewAxis(
  position: Vector3,
  forward: Vector3,
  orbitPoint: Vector3,
  up: Vector3
): ViewPose {
  const f = forward.clone().normalize()
  const depth = orbitPoint.clone().sub(position).dot(f)
  return {
    position: position.clone(),
    target: position.clone().addScaledVector(f, depth),
    up: up.clone(),
  }
}

/** Same pose; the orthographic zoom shows exactly what the perspective camera shows at the target. */
export function perspectiveToOrthographic(
  pose: ViewPose,
  lens: { fovDeg: number; zoom: number },
  frustumHeight: number
): { pose: ViewPose; zoom: number; visibleHeight: number } {
  const distance = pose.position.distanceTo(pose.target)
  const visibleHeight = visibleHeightAtDistance(distance, lens.fovDeg, lens.zoom)
  return {
    pose: { position: pose.position.clone(), target: pose.target.clone(), up: pose.up.clone() },
    zoom: orthoZoomForVisibleHeight(frustumHeight, visibleHeight),
    visibleHeight,
  }
}

/**
 * Keeps target, view direction and up; moves the camera along the view axis to the distance
 * that shows the same height. `exact` is false when the distance limits clamped it.
 */
export function orthographicToPerspective(
  pose: ViewPose,
  ortho: { zoom: number; frustumHeight: number },
  fovDeg: number,
  limits?: { minDistance: number; maxDistance: number }
): { pose: ViewPose; distance: number; visibleHeight: number; exact: boolean } {
  const visibleHeight = orthoVisibleHeight(ortho.frustumHeight, ortho.zoom)
  const wanted = distanceForVisibleHeight(visibleHeight, fovDeg)
  const distance = limits
    ? Math.min(limits.maxDistance, Math.max(limits.minDistance, wanted))
    : wanted
  const forward = pose.target.clone().sub(pose.position).normalize()
  const position = pose.target.clone().addScaledVector(forward, -distance)
  return {
    pose: { position, target: pose.target.clone(), up: pose.up.clone() },
    distance,
    visibleHeight,
    exact: distance === wanted,
  }
}

/** Orthographic zoom limits that mirror the perspective dolly limits. */
export function orthoZoomLimits(
  frustumHeight: number,
  fovDeg: number,
  minDistance: number,
  maxDistance: number
): { minZoom: number; maxZoom: number } {
  return {
    minZoom: frustumHeight / visibleHeightAtDistance(maxDistance, fovDeg),
    maxZoom: frustumHeight / visibleHeightAtDistance(minDistance, fovDeg),
  }
}
