import { describe, expect, it } from "vitest"
import { EXPR_LIMITS } from "./ast"
import { checkBehaviour } from "./check"
import { runProgram, unknownNames, type Value } from "./evaluate"
import { ExprError } from "./lexer"
import { parseProgram } from "./parser"

const run = (source: string, inputs: Record<string, Value> = {}) =>
  Object.fromEntries(runProgram(parseProgram(source), new Map(Object.entries(inputs))))
const refusal = (source: string): string => {
  try {
    parseProgram(source)
    return ""
  } catch (e) {
    return e instanceof ExprError ? e.message : `not an ExprError: ${String(e)}`
  }
}

describe("behaviour expressions (PLAN 11.5)", () => {
  it("computes outputs from inputs, line by line", () => {
    expect(run("out = vin > 2.5 ? 1 : 0", { vin: 3.3 })).toEqual({ out: 1 })
    expect(run("I_draw = 0.12")).toEqual({ I_draw: 0.12 })
    expect(run("x = a * 2 # double it\ny = x + 1; z = -y ^ 2", { a: 3 })).toEqual({
      x: 6,
      y: 7,
      z: -49,
    })
    expect(run("p = 2 ^ 3 ^ 2")).toEqual({ p: 512 }) // right-associative
    expect(run("m = map(512, 0, 1023, 0, 5); c = clamp(7, 0, 5); h = max(1, 4, 2)")).toEqual({
      m: (512 * 5) / 1023,
      c: 5,
      h: 4,
    })
    expect(run("on = a && !b || false; n = on + 1", { a: true, b: false })).toEqual({
      on: true,
      n: 2,
    })
    expect(run("r = sin(PI / 2)").r).toBeCloseTo(1, 15)
  })

  it("lists the names it reads that nothing gives", () => {
    const program = parseProgram("y = a + b\nz = y * c")
    expect(unknownNames(program, new Set(["a"]))).toEqual(["b", "c"])
  })

  it("refuses prototype names, member access, strings and calls to anything not listed", () => {
    expect(refusal("__proto__ = 1")).toMatch(/cannot be a name/)
    expect(refusal("x = constructor")).toMatch(/cannot be a name/)
    expect(refusal("x = a.constructor")).toMatch(/unexpected "\."/)
    expect(refusal("x = a[0]")).toMatch(/unexpected "\["/)
    expect(refusal('x = "text"')).toMatch(/unexpected """/)
    expect(refusal("x = eval(1)")).toMatch(/"eval" is not a function/)
    expect(refusal("x = Function(1)")).toMatch(/is not a function/)
    expect(refusal("x = toString(1)")).toMatch(/is not a function/)
    expect(refusal("x = `a`")).toMatch(/unexpected/)
    expect(refusal("PI = 3")).toMatch(/built in/)
    expect(refusal("x = abs(1, 2)")).toMatch(/takes 1 values/)
  })

  it("an input named like a prototype member can never be read through a name", () => {
    // Values are in a Map: `hasOwnProperty` is just an unknown name, not Object's method.
    expect(() => run("x = hasOwnProperty")).toThrow(/not an input/)
    expect(() => run("x = valueOf + 1")).toThrow(/not an input/)
  })

  it("stops at its limits: length, terms, nesting and lines", () => {
    expect(refusal(`x = ${"1+".repeat(EXPR_LIMITS.maxChars)}1`)).toMatch(/longer than/)
    expect(refusal(`x = ${"1+".repeat(600)}1`)).toMatch(/more than 512 terms/)
    expect(refusal(`x = ${"(".repeat(40)}1${")".repeat(40)}`)).toMatch(/nested deeper than 32/)
    expect(refusal(`x = ${"-".repeat(40)}1`)).toMatch(/nested deeper than 32/)
    expect(refusal(Array.from({ length: 70 }, (_, i) => `v${i} = ${i}`).join("\n"))).toMatch(
      /more than 64 lines/
    )
  })

  it("says where a mistake is", () => {
    expect(refusal("a = 1\nb = (2 + ")).toMatch(/^Line 2, column \d+: expected a value/)
    expect(refusal("a = 1 2")).toMatch(/^Line 1, column 7: unexpected "2"/)
    expect(() => run("a = 1 / 0")).toThrow(/a is not a finite number/)
    expect(() => run("a = b")).toThrow(/^Line 1, column 5: "b" is not an input/)
  })
})

describe("behaviour check (PLAN 11.5)", () => {
  const port = (key: string, direction: "in" | "out") =>
    ({ key, name: key, domain: "data", direction, unit: "" }) as const
  const def = {
    ports: [port("vin", "in"), port("out", "out"), port("led", "out")],
    params: [{ key: "level", name: "Level", unit: "V", kind: "number" as const, default: 2.5 }],
  }

  it("names unknown inputs, outputs never set and inputs written to", () => {
    const r = checkBehaviour("x = vin * gain\nout = x > level\nvin = 1", def)
    expect(r.error).toBeNull()
    expect(r.unknown).toEqual(["gain"])
    expect(r.unset).toEqual(["led"])
    expect(r.readOnly).toEqual(["vin"])
  })

  it("reports a syntax error with its place", () => {
    const r = checkBehaviour("out = vin >\nled = 1", def)
    expect(r.error?.line).toBe(1)
    expect(r.error?.message).toMatch(/^Line 1, column \d+:/)
  })
})
