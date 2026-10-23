// @vitest-environment node
import { readFileSync } from "node:fs"
import occtInit from "occt-import-js"
import { describe, expect, it } from "vitest"
import { decodeGlb } from "@/core/geometry/glbRead"
import { snapFeatures, type SnapArc } from "@/core/geometry/snapFeatures"
import { DEFAULT_IMPORT_OPTIONS } from "@/core/import/importOptions"
import { runImport } from "./runImport"

// PLAN 7.5: what anchor snapping finds on a real STEP part (tools/fixtures/makePlateStep.mjs):
// a 40 x 8 x 30 mm plate lying flat (y up) with a Ø8 mm through hole centred at x = 5, z = 0.

async function plate() {
  const b = readFileSync(new URL("../../../tests/fixtures/plate-hole.step", import.meta.url))
  const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  const job = { fileName: "plate-hole.step", format: "step" as const, bytes }
  const { parts } = await runImport(
    { ...job, options: DEFAULT_IMPORT_OPTIONS },
    { occt: () => occtInit() }
  )
  const glb = parts[0]?.asset.glb
  if (!glb) throw new Error("not imported")
  return decodeGlb(glb)
}

describe("snap features of the plate with a hole", () => {
  it("classifies the B-rep faces: six planes and the bore as two half cylinders", async () => {
    const { faces } = await plate()
    expect(faces.filter((f) => f.kind === "plane")).toHaveLength(6)
    const bore = faces.filter((f) => f.kind === "cylinder")
    expect(bore).toHaveLength(2)
    for (const f of bore) {
      expect(f.radiusMm).toBeCloseTo(4, 3)
      expect(f.axis?.map((v) => Math.abs(v))).toEqual([
        expect.closeTo(0, 6),
        expect.closeTo(1, 6),
        expect.closeTo(0, 6),
      ])
      expect([f.point?.[0], f.point?.[2]]).toEqual([expect.closeTo(5, 3), expect.closeTo(0, 3)])
    }
  }, 30_000)

  it("finds the plate's corners and edges, and both rims of the hole", async () => {
    const { mesh, faces } = await plate()
    const { corners, edges, cylinderSense } = snapFeatures(mesh, faces)
    expect(corners).toHaveLength(8)
    expect(edges.filter((e) => e.kind === "line")).toHaveLength(12)
    const rims = edges.filter((e): e is SnapArc => e.kind === "arc")
    expect(rims).toHaveLength(4) // each rim: two half circles, one per half cylinder
    for (const rim of rims) {
      expect(rim.radius).toBeCloseTo(4, 3)
      expect(rim.axis).toEqual([expect.closeTo(0, 6), expect.closeTo(1, 6), expect.closeTo(0, 6)])
      expect([rim.centre[0], rim.centre[2]]).toEqual([expect.closeTo(5, 3), expect.closeTo(0, 3)])
    }
    // Assets are centred on their box (the part's pose holds the offset): the plate spans
    // y -4..4, so the rims are on its top and bottom faces there.
    expect(rims.map((r) => Math.round(r.centre[1])).sort()).toEqual([-4, -4, 4, 4])
    const bore = faces.flatMap((f, i) => (f.kind === "cylinder" ? [i] : []))
    expect(bore.map((i) => cylinderSense[i])).toEqual([-1, -1]) // a hole, not a shaft
  }, 30_000)
})
