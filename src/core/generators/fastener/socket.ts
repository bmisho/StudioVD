import type { BodyBuilder } from "../mesh/builder"
import { circle, hexagon } from "../mesh/outline"
import { cap } from "../mesh/planar"
import { wall } from "../mesh/prism"

/** Area of a regular hexagon by its width across flats. */
export const hexArea = (acrossFlats: number): number => (Math.sqrt(3) / 2) * acrossFlats ** 2

/**
 * A flat top at `y` from a ring of radius `r` (the revolved profile's last point, `n`
 * segments) in to a hex socket `s` across flats, `t` deep: the annulus, the six socket walls
 * and the socket's floor (drawn flat; the drill point is left out). Returns the socket's volume.
 */
export function hexSocketTop(
  b: BodyBuilder,
  y: number,
  r: number,
  n: number,
  s: number,
  t: number
): number {
  const hex = hexagon(s)
  cap(b, y, circle(r, n), [hex], true)
  wall(b, hex, y - t, hex, y, false)
  cap(b, y - t, hex, [], true)
  return hexArea(s) * t
}
