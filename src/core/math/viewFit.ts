import { Vector3, type Box3, type Quaternion } from "three"

/** Camera axes in world space: right, up, and forward (the direction the camera looks). */
export interface ViewBasis {
  right: Vector3
  up: Vector3
  forward: Vector3
}

export function basisFromQuaternion(q: Quaternion): ViewBasis {
  return {
    right: new Vector3(1, 0, 0).applyQuaternion(q),
    up: new Vector3(0, 1, 0).applyQuaternion(q),
    forward: new Vector3(0, 0, -1).applyQuaternion(q),
  }
}

/** Padding is a fraction of the frustum on each side (0.05 = 5 % margin). */
export interface FitOptions {
  fovDeg: number
  aspect: number
  padding: number
}

interface ViewExtent {
  /** Box corners relative to the box centre, in view coordinates (z points at the camera). */
  points: { x: number; y: number; z: number }[]
  cx: number
  cy: number
  centre: Vector3
}

function viewExtent(box: Box3, b: ViewBasis): ViewExtent {
  const centre = box.getCenter(new Vector3())
  const points: ViewExtent["points"] = []
  for (const sx of [box.min.x, box.max.x])
    for (const sy of [box.min.y, box.max.y])
      for (const sz of [box.min.z, box.max.z]) {
        const v = new Vector3(sx, sy, sz).sub(centre)
        points.push({ x: v.dot(b.right), y: v.dot(b.up), z: -v.dot(b.forward) })
      }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return {
    points,
    cx: (Math.max(...xs) + Math.min(...xs)) / 2,
    cy: (Math.max(...ys) + Math.min(...ys)) / 2,
    centre,
  }
}

/**
 * Tightest perspective fit that keeps the current view direction (camera-controls'
 * fitToBox snaps to the nearest axis, which is wrong for CAD). Every corner ends up inside
 * the padded frustum; the limiting corner touches it.
 */
export function fitBoxPerspective(
  box: Box3,
  b: ViewBasis,
  o: FitOptions
): { target: Vector3; distance: number; position: Vector3 } {
  const { points, cx, cy, centre } = viewExtent(box, b)
  const tanY = Math.tan((o.fovDeg * Math.PI) / 180 / 2) * (1 - 2 * o.padding)
  const tanX = o.aspect * tanY
  let distance = 0
  for (const p of points) {
    distance = Math.max(distance, p.z + Math.abs(p.y - cy) / tanY, p.z + Math.abs(p.x - cx) / tanX)
  }
  const target = centre.clone().addScaledVector(b.right, cx).addScaledVector(b.up, cy)
  return { target, distance, position: target.clone().addScaledVector(b.forward, -distance) }
}

/** Orthographic fit: the visible height (mm) that shows the whole box with padding. */
export function fitBoxOrthographic(
  box: Box3,
  b: ViewBasis,
  aspect: number,
  padding: number
): { target: Vector3; visibleHeight: number } {
  const { points, cx, cy, centre } = viewExtent(box, b)
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const extentX = Math.max(...xs) - Math.min(...xs)
  const extentY = Math.max(...ys) - Math.min(...ys)
  const visibleHeight = Math.max(extentY, extentX / aspect) / (1 - 2 * padding)
  const target = centre.clone().addScaledVector(b.right, cx).addScaledVector(b.up, cy)
  return { target, visibleHeight }
}
