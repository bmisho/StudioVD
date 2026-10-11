import { visibleHeightAtDistance } from "./projection"

// The CAD grid picks its spacing from the zoom: decade levels (1/10, 10/100, 100/1000 mm …),
// so it never turns into grey mush. Typical framing shows 10 mm minor / 100 mm major lines.

export interface GridLevel {
  minorMm: number
  majorMm: number
  /** Minor lines fade out as their cells shrink towards `minCellPx`. */
  minorOpacity: number
}

export function gridLevel(mmPerPx: number, minCellPx = 6): GridLevel {
  if (!Number.isFinite(mmPerPx) || mmPerPx <= 0)
    return { minorMm: 10, majorMm: 100, minorOpacity: 1 }
  // Smallest power of ten whose cell is at least minCellPx wide; never below 1 mm.
  const exponent = Math.max(0, Math.ceil(Math.log10(minCellPx * mmPerPx) - 1e-9))
  const minorMm = 10 ** exponent
  const cellPx = minorMm / mmPerPx
  return {
    minorMm,
    majorMm: minorMm * 10,
    minorOpacity: Math.min(1, Math.max(0, (cellPx - minCellPx) / minCellPx)),
  }
}

export type ViewSpec =
  | { kind: "perspective"; fovDeg: number; distanceMm: number }
  | { kind: "orthographic"; frustumHeight: number; zoom: number }

/** Visible height at the orbit target (PLAN §2). */
export function visibleHeightMm(v: ViewSpec): number {
  return v.kind === "perspective"
    ? visibleHeightAtDistance(v.distanceMm, v.fovDeg)
    : v.frustumHeight / v.zoom
}

/**
 * Radius around the target where the grid fades out. In orthographic the camera distance is a
 * standoff with no visual meaning, so only the visible extent counts.
 */
export function gridFadeRadiusMm(v: ViewSpec, aspect: number): number {
  const diagonal = visibleHeightMm(v) * Math.hypot(1, aspect)
  return v.kind === "orthographic" ? 0.75 * diagonal : Math.max(3 * v.distanceMm, 0.75 * diagonal)
}
