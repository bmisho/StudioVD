import { describe, expect, it } from "vitest"
import { boardPoint, readFootprint, sceneOffset } from "./footprint"

// Written for this test in KiCad's format (not copied from KiCad's libraries).
const fp = (model = "(offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0))") => `
(footprint "Test_2pin" (version 20260206) (descr "two pins")
  (pad "1" thru_hole rect (at 0 0) (size 1.8 1.8) (drill 0.9) (layers "*.Cu"))
  (pad "2" thru_hole circle (at 2.54 1.5) (size 1.8 1.8) (drill 0.9) (layers "*.Cu"))
  (pad "" np_thru_hole circle (at 1 -3) (size 3 3) (drill 3))
  (pad "3" smd roundrect (at -1 0 90) (size 1 1) (drill (offset -0.8 0)) (layers "F.Cu"))
  (model "\${KICAD10_3DMODEL_DIR}/Test.3dshapes/Test_2pin.step" ${model}))`

describe("KiCad footprints (PLAN 14.7)", () => {
  it("reads pads, drills and the model path", () => {
    const f = readFootprint(fp())
    expect(f.name).toBe("Test_2pin")
    expect(f.pads.map((p) => [p.number, p.kind, p.x, p.y, p.drillMm])).toEqual([
      ["1", "thru_hole", 0, 0, 0.9],
      ["2", "thru_hole", 2.54, 1.5, 0.9],
      ["", "np_thru_hole", 1, -3, 3],
      ["3", "smd", -1, 0, undefined],
    ])
    expect(f.models).toEqual([
      {
        path: "${KICAD10_3DMODEL_DIR}/Test.3dshapes/Test_2pin.step",
        offset: [0, 0, 0],
        hidden: false,
      },
    ])
  })

  it("takes a moved model (offsets along KiCad's 3D axes), refuses a turned or scaled one", () => {
    const moved = readFootprint(
      fp("(hide yes) (offset (xyz 8.89 -24.13 1)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0))")
    )
    expect(moved.models[0]).toMatchObject({ offset: [8.89, -24.13, 1], hidden: true })
    // +y up the board in 3D is −y in the footprint and −z in the scene.
    expect(sceneOffset([8.89, -24.13, 1])).toEqual([8.89, 1, 24.13])
    expect(() =>
      readFootprint(fp("(offset (xyz 0 0 0)) (scale (xyz 2 1 1)) (rotate (xyz 0 0 0))"))
    ).toThrow("scale")
    expect(() =>
      readFootprint(fp("(offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 90))"))
    ).toThrow("rotation")
  })

  it("puts board points where the imported model has them: y down the board is +z", () => {
    expect(boardPoint(2.54, 1.5)).toEqual([2.54, 0, 1.5])
  })
})
