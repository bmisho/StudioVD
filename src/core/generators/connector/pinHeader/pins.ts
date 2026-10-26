import type { BodyBuilder } from "../../mesh/builder"
import { rectangle, scaled, shifted } from "../../mesh/outline"
import { cap } from "../../mesh/planar"
import { wall } from "../../mesh/prism"

/** Square pins 0.64 mm with a tip tapered to 60 % over 0.3 mm (KiCad-style 2.54 mm pins). */
export const PIN = { side: 0.64, taper: 0.6, tip: 0.3 } as const

/**
 * One square pin piece from `y0` to `y1` at (u, v), tapered at the far end (`up`: the top),
 * flat on the housing: a closed shell of its own that touches the housing only face to face.
 * Returns its volume.
 */
export function pinPiece(
  b: BodyBuilder,
  u: number,
  v: number,
  y0: number,
  y1: number,
  up: boolean,
  slot: number
): number {
  const square = shifted(rectangle(PIN.side, PIN.side), u, v)
  const tip = shifted(scaled(rectangle(PIN.side, PIN.side), PIN.taper), u, v)
  const [flat, far] = up ? [y0, y1] : [y1, y0]
  const shoulder = up ? far - PIN.tip : far + PIN.tip
  wall(b, square, Math.min(flat, shoulder), square, Math.max(flat, shoulder), true, slot)
  if (up) wall(b, square, shoulder, tip, far, true, slot)
  else wall(b, tip, far, square, shoulder, true, slot)
  cap(b, flat, square, [], !up, slot)
  cap(b, far, tip, [], up, slot)
  const s2 = PIN.side ** 2
  const t2 = (PIN.side * PIN.taper) ** 2
  return s2 * Math.abs(shoulder - flat) + (PIN.tip * (s2 + t2 + Math.sqrt(s2 * t2))) / 3
}
