import type { Sphere, Vector3 } from "three"

// Clip planes from the scene bounds, so 0.5 mm SMD parts and 2 m assemblies both render
// with a standard 24-bit depth buffer (no logarithmic depth: it disables early-Z).

/**
 * Distance an orthographic camera must keep from its target so that everything in `bounds`
 * is in front of it. Moving an ortho camera along its axis does not change the image, and a
 * negative near plane would draw geometry that cannot be picked (three's ortho ray starts at
 * the camera plane).
 */
export function orthoStandoff(target: Vector3, bounds: Sphere, margin: number): number {
  return target.distanceTo(bounds.center) + bounds.radius + margin
}

export function orthoClipPlanes(
  position: Vector3,
  forward: Vector3,
  bounds: Sphere,
  targetDepth: number,
  margin: number
): { near: number; far: number } {
  const depth = bounds.center.clone().sub(position).dot(forward)
  return {
    near: Math.max(0.1 * margin, depth - bounds.radius - margin),
    far: Math.max(depth + bounds.radius + margin, targetDepth + margin),
  }
}

/**
 * Perspective near/far hugging the bounds. `maxRatio` caps far/near (1e4 is about 1 px of
 * depth error at `far`), and near never passes 90 % of the target distance.
 */
export function perspectiveClipPlanes(
  position: Vector3,
  bounds: Sphere,
  targetDistance: number,
  o: { maxRatio: number; minNear: number }
): { near: number; far: number } {
  const toCentre = position.distanceTo(bounds.center)
  const far = Math.max((toCentre + bounds.radius) * 1.02, 1.02 * targetDistance)
  const near = Math.min(
    Math.max(0.98 * (toCentre - bounds.radius), far / o.maxRatio, o.minNear),
    0.9 * targetDistance
  )
  return { near, far }
}
