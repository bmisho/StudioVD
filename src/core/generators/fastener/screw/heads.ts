import type { BodyBuilder } from "../../mesh/builder"
import { circle, hexagon, type Vec2 } from "../../mesh/outline"
import { cap } from "../../mesh/planar"
import { wall } from "../../mesh/prism"
import { arc, revolve, revolvedVolume } from "../../mesh/revolve"
import { metric, type MetricSize } from "../metric"
import { hexArea, hexSocketTop } from "../socket"

export const HEADS = ["socket", "button", "hex"] as const
export type Head = (typeof HEADS)[number]

/**
 * The screw from its tip (y = 0) up to the top of its head: the shank as a plain cylinder at
 * the nominal diameter with a 45° chamfer one pitch long, then the head. Returns the volume of
 * the modelled solid and the head's top height.
 */
export function screwBody(
  b: BodyBuilder,
  size: MetricSize,
  length: number,
  head: Head,
  n: number
): { volume: number; top: number } {
  const row = metric(size)
  const r = row.d / 2
  const c = Math.min(row.pitch, length / 4, r / 2)
  const shank: Vec2[] = [
    [0, 0],
    [r - c, 0],
    [r, c],
    [r, length],
  ]
  if (head === "hex") {
    const { s, k } = row.hex
    revolve(b, toRuns(shank), n)
    const hex = hexagon(s)
    cap(b, length, hex, [circle(r, n)], false)
    wall(b, hex, length, hex, length + k, true)
    cap(b, length + k, hex, [], true)
    const volume = revolvedVolume([...shank, [0, length]]) + hexArea(s) * k
    return { volume, top: length + k }
  }
  if (head === "socket") {
    const { dk, k, s, t } = row.cap
    const [R, e] = [dk / 2, 0.06 * dk]
    const profile: Vec2[] = [...shank, [R, length], [R, length + k - e], [R - e, length + k]]
    revolve(b, toRuns(profile), n)
    const socket = hexSocketTop(b, length + k, R - e, n, s, t)
    return { volume: revolvedVolume([...profile, [0, length + k]]) - socket, top: length + k }
  }
  const button = row.button
  if (!button) throw new Error(`no ISO 7380 button head for ${size}`)
  const { dk, k, s, t } = button
  // The dome: a spherical cap through the head's rim and top, flattened where the socket is.
  const a = dk / 2
  const radius = (a * a + k * k) / (2 * k)
  const yc = length + k - radius
  const flat = s / Math.sqrt(3) + 0.25 * s
  const from = Math.atan2(length - yc, a)
  const to = Math.acos(flat / radius)
  const dome = arc([0, yc], radius, from, to, 8)
  dome[0] = [a, length] // the rim, exactly where the underside ends
  const end = dome.at(-1) ?? [flat, length + k]
  const profile: Vec2[] = [...shank, [a, length], ...dome.slice(1)]
  revolve(
    b,
    [
      ...toRuns(shank),
      [
        [r, length],
        [a, length],
      ],
      dome,
    ],
    n
  )
  const socket = hexSocketTop(b, end[1], end[0], n, s, t)
  return { volume: revolvedVolume([...profile, [0, end[1]]]) - socket, top: end[1] }
}

/** One run per segment of a polyline profile (every corner a crease). */
export const toRuns = (points: readonly Vec2[]): Vec2[][] =>
  points.slice(0, -1).map((p, i) => [p, points[i + 1] ?? p])
