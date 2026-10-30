import { describe, expect, it } from "vitest"
import { paramFields, paramLabel } from "./paramFields"
import { GENERATORS, findGenerator } from "./registry"

describe("generator parameter forms", () => {
  it("labels keys with their units", () => {
    expect(paramLabel("boreMm")).toBe("Bore (mm)")
    expect(paramLabel("pressureAngleDeg")).toBe("Pressure angle (°)")
    expect(paramLabel("pinsPerRow")).toBe("Pins per row")
  })

  it("describes every parameter of every generator", () => {
    for (const g of GENERATORS)
      expect(
        paramFields(g.params).map((f) => f.key),
        g.id
      ).toEqual(Object.keys(g.defaults))
  })

  it("reads bounds, choices and the gear's auto profile shift", () => {
    const gear = paramFields(findGenerator("gear.spur", 1)?.params ?? ({} as never))
    expect(gear.find((f) => f.key === "teeth")).toMatchObject({
      kind: "number",
      min: 8,
      max: 200,
      integer: true,
    })
    expect(gear.find((f) => f.key === "profileShift")).toMatchObject({
      kind: "numberOrAuto",
      min: -0.5,
      max: 1,
    })
    const pulley = paramFields(findGenerator("pulley.gt2", 1)?.params ?? ({} as never))
    expect(pulley.find((f) => f.key === "beltWidthMm")).toMatchObject({
      kind: "choice",
      options: [6, 9, 10],
    })
    expect(pulley.find((f) => f.key === "flanges")).toMatchObject({ kind: "boolean" })
  })
})
