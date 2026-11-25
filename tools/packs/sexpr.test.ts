import { describe, expect, it } from "vitest"
import { child, children, num, parseSExpr } from "./sexpr"

describe("KiCad S-expressions (PLAN 14.7)", () => {
  it("reads lists, atoms and quoted strings with escapes", () => {
    const e = parseSExpr('(footprint "A \\"B\\"" (at 1.27 -3.96 0) (pad "1" thru_hole rect))')
    expect(e).toEqual([
      "footprint",
      'A "B"',
      ["at", "1.27", "-3.96", "0"],
      ["pad", "1", "thru_hole", "rect"],
    ])
    expect(num(child(e, "at"), 2, "y")).toBe(-3.96)
    expect(children(e, "pad")).toHaveLength(1)
  })

  it("refuses malformed or hostile input", () => {
    for (const bad of ["(a (b)", "(a))", '(a "b)', "(a) (b)", ")"])
      expect(() => parseSExpr(bad)).toThrow()
    expect(() => parseSExpr(`${"(".repeat(100)}${")".repeat(100)}`)).toThrow("deeply")
    expect(() => num(["at", "x"], 1, "x")).toThrow("not a number")
  })
})
