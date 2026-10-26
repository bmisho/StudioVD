import type { Vec2 } from "../../mesh/outline"

/** GT2 2 mm: pitch, and the pitch line's distance outside the pulley's tips (PLD). */
export const GT2_PITCH = 2
export const GT2_PLD = 0.254
/** The groove, drawn as one arc: its radius and depth below the tips (a visual fit). */
const GROOVE_R = 0.6
const GROOVE_DEPTH = 0.75

/** Pitch diameter d_p = z p / π (PLAN §2: 20 teeth → 12.73 mm). */
export const gt2PitchDiameter = (z: number): number => (z * GT2_PITCH) / Math.PI

/**
 * The toothed outline of a GT2 pulley, counter-clockwise: lands on the tip circle
 * (r_o = d_p/2 − PLD) between round grooves 0.75 mm deep, one per tooth of the belt.
 */
export function gt2Outline(z: number, landSteps = 3, grooveSteps = 10): Vec2[] {
  const ro = gt2PitchDiameter(z) / 2 - GT2_PLD
  const rc = ro - GROOVE_DEPTH + GROOVE_R // groove centre's distance from the axis
  const beta = Math.acos((ro * ro + rc * rc - GROOVE_R * GROOVE_R) / (2 * ro * rc))
  // The groove meets the tip circle at ±beta; about its centre, from φ− round the inside.
  const phi = Math.atan2(-ro * Math.sin(beta), ro * Math.cos(beta) - rc)
  const sweep = 2 * Math.PI - 2 * Math.abs(phi)
  const pitch = (2 * Math.PI) / z
  const points: Vec2[] = []
  const rot = (p: Vec2, a: number): Vec2 => [
    p[0] * Math.cos(a) - p[1] * Math.sin(a),
    p[0] * Math.sin(a) + p[1] * Math.cos(a),
  ]
  for (let k = 0; k < z; k++) {
    const c = k * pitch
    for (let j = 0; j <= grooveSteps; j++) {
      const a = phi - (sweep * j) / grooveSteps
      const local: Vec2 =
        j === 0
          ? [ro * Math.cos(beta), -ro * Math.sin(beta)]
          : j === grooveSteps
            ? [ro * Math.cos(beta), ro * Math.sin(beta)]
            : [rc + GROOVE_R * Math.cos(a), GROOVE_R * Math.sin(a)]
      points.push(rot(local, c))
    }
    for (let j = 1; j < landSteps; j++) {
      const a = c + beta + ((pitch - 2 * beta) * j) / landSteps
      points.push([ro * Math.cos(a), ro * Math.sin(a)])
    }
  }
  return points
}
