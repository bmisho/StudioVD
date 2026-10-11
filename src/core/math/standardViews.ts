// Standard CAD views. Y-up, right-handed; Front looks from +Z, Right from +X (SolidWorks).

export type StandardView = "front" | "back" | "left" | "right" | "top" | "bottom" | "isometric"
export type Direction = readonly [number, number, number]

const S = 1 / Math.sqrt(3)

/** Unit direction from the orbit target to the camera. */
export const STANDARD_VIEW_DIRECTIONS: Readonly<Record<StandardView, Direction>> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  isometric: [S, S, S],
}

/**
 * Orbit angles in the camera-controls convention: azimuth about +Y measured from +Z towards
 * +X, polar from +Y. At the poles the azimuth is 0, so Top shows Front at the bottom.
 */
export function orbitAnglesFor(direction: Direction): { azimuth: number; polar: number } {
  const [x, y, z] = direction
  const length = Math.hypot(x, y, z)
  const ny = Math.min(1, Math.max(-1, y / length))
  const polar = Math.acos(ny)
  const azimuth = Math.abs(ny) > 1 - 1e-6 ? 0 : Math.atan2(x / length, z / length)
  return { azimuth, polar }
}

/** The equivalent of `wanted` (mod 2π) closest to `current`, so views turn the short way. */
export function nearestAzimuth(current: number, wanted: number): number {
  const turn = 2 * Math.PI
  return wanted + turn * Math.round((current - wanted) / turn)
}

/**
 * Direction for a view-cube hit: edge and corner pieces sit off-centre (their position gives
 * the direction); faces sit at the centre and use their normal.
 */
export function cubeHitDirection(
  objectPosition: Direction,
  faceNormal: Direction | null
): Direction | null {
  const [px, py, pz] = objectPosition
  const length = Math.hypot(px, py, pz)
  if (length > 1e-9) return [px / length, py / length, pz / length]
  if (!faceNormal) return null
  const [nx, ny, nz] = faceNormal
  const n = Math.hypot(nx, ny, nz)
  return n > 1e-9 ? [nx / n, ny / n, nz / n] : null
}
