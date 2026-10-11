import { describe, expect, it } from "vitest"
import {
  DEFAULT_IMPORT_OPTIONS,
  formatNeedsUnit,
  formatOf,
  ImportOptionsSchema,
  mmPerUnit,
} from "./importOptions"

describe("import options", () => {
  it("detects formats by extension, case-insensitively", () => {
    expect(formatOf("Bracket.STP")).toBe("step")
    expect(formatOf("a.b.igs")).toBe("iges")
    expect(formatOf("model.glb")).toBe("glb")
    expect(formatOf("notes.txt")).toBeNull()
    expect(formatOf("README")).toBeNull()
  })

  it("applies the unit only where the file has none", () => {
    expect(formatNeedsUnit("stl")).toBe(true)
    expect(formatNeedsUnit("step")).toBe(false)
    expect(mmPerUnit("stl", "in")).toBe(25.4)
    expect(mmPerUnit("glb", "in")).toBe(1000)
    expect(mmPerUnit("step", "cm")).toBe(1)
  })

  it("validates options strictly", () => {
    expect(ImportOptionsSchema.parse(DEFAULT_IMPORT_OPTIONS)).toEqual(DEFAULT_IMPORT_OPTIONS)
    expect(ImportOptionsSchema.safeParse({ ...DEFAULT_IMPORT_OPTIONS, unit: "yd" }).success).toBe(
      false
    )
  })
})
