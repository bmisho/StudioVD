import { describe, expect, it } from "vitest"
import { FOOTPRINTS, FOOTPRINT_DATA, KNOWN_MASS, RIM_WIDTH_MM } from "./sizes"
import { containerEurobox } from "./v1"

/** Bounds of a body's vertices (mm). */
function bounds(positions: ArrayLike<number>) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k] ?? 0
      min[k] = Math.min(min[k] ?? v, v)
      max[k] = Math.max(max[k] ?? v, v)
    }
  return { min, max }
}

const run = (size: string, heightMm: number) => {
  const out = containerEurobox.generate({ size, heightMm })
  const box = out.bodies.box
  if (!box) throw new Error("no box")
  return { out, box }
}

describe("Eurobox generator (0.2.1)", () => {
  it("offers every listed height of every footprint, and fills its footprint exactly", () => {
    const listed = FOOTPRINTS.flatMap((f) => FOOTPRINT_DATA[f].heightsMm.map((h) => `${f}x${h}`))
    expect(containerEurobox.presets.map((p) => p.key)).toEqual(listed.map((k) => `s${k}`))
    expect(containerEurobox.presets).toHaveLength(21)
    for (const f of FOOTPRINTS) {
      const d = FOOTPRINT_DATA[f]
      const { box } = run(f, d.heightsMm[0] ?? 120)
      const { min, max } = bounds(box.mesh.positions)
      expect(max[0]! - min[0]!).toBeCloseTo(d.lengthMm, 6) // eslint-disable-line @typescript-eslint/no-non-null-assertion -- three axes, filled above
      expect(max[2]! - min[2]!).toBeCloseTo(d.widthMm, 6) // eslint-disable-line @typescript-eslint/no-non-null-assertion -- as above
      expect(min[1]).toBe(0)
      expect(max[1]).toBe(d.heightsMm[0])
    }
  })

  it("stacks: the foot stands in the opening below, its shoulder on that box's rim", () => {
    for (const f of FOOTPRINTS) {
      const d = FOOTPRINT_DATA[f]
      const { out } = run(f, 220)
      const rim = out.anchors.rim
      const seat = out.anchors.seat
      expect(rim?.interface).toBe(`eurobox-${f}`)
      expect(seat?.interface).toBe(rim?.interface)
      expect(rim?.frame.originMm[1]).toBe(220)
      expect(seat?.frame.originMm[1]).toBe(d.footMm)
      expect(seat?.frame.z).toEqual([0, -1, 0]) // face to face with the rim (up)
    }
    // The foot (inset 17 mm) clears the opening (inset 15 mm); the shoulder (from 12.5 mm) laps
    // the rim below it.
    expect(RIM_WIDTH_MM).toBe(15)
  })

  it("weighs about what the listed box weighs (no handles or ribs: within 25 %)", () => {
    const { box, out } = run(KNOWN_MASS.footprint, KNOWN_MASS.heightMm)
    const material = out.materials.shell
    const density = material?.kind === "inline" ? material.densityKgM3 : NaN
    const kg = (box.volumeMm3 * density) / 1e9 // 1.41 kg modelled, 1.51 kg listed
    expect(kg).toBeGreaterThan(KNOWN_MASS.kg * 0.75)
    expect(kg).toBeLessThan(KNOWN_MASS.kg * 1.25)
  })

  it("refuses a box too low for its foot, ledge and rim, and footprints not in the family", () => {
    expect(containerEurobox.params.safeParse({ size: "600x400", heightMm: 59 }).success).toBe(false)
    expect(containerEurobox.params.safeParse({ size: "600x400", heightMm: 60 }).success).toBe(true)
    expect(containerEurobox.params.safeParse({ size: "500x400", heightMm: 120 }).success).toBe(
      false
    )
  })
})
