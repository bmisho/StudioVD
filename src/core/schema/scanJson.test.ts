import { describe, expect, it } from "vitest"
import { jsonTextShape, scanJsonValue, shownProblem } from "./scanJson"
import { sampleDocument } from "./testing/sampleDocument"

const limits = { maxDepth: 4, maxValues: 20, maxString: 12 }
const wide = { maxDepth: 1_000, maxValues: 1_000_000 }

/** Values in a parsed JSON value, the way the scan counts them (keys are not values). */
const countValues = (v: unknown): number =>
  typeof v === "object" && v !== null
    ? 1 + Object.values(v).reduce((n: number, child) => n + countValues(child), 0)
    : 1

describe("jsonTextShape", () => {
  it("counts nesting and values outside strings, escapes included", () => {
    expect(jsonTextShape("1", wide)).toEqual({ depth: 0, values: 1 })
    expect(jsonTextShape('{"a":[1,{"b":[]}]}', wide)).toEqual({ depth: 4, values: 5 })
    expect(jsonTextShape('{"a":"[[[[{{{{","b":"\\"[["}', wide)).toEqual({ depth: 1, values: 3 })
    const scalars = '{ "k" : "v" , "a" : [ -1.5e+3 , true , null , "x" ] , "e" : { } }'
    expect(jsonTextShape(scalars, wide)).toEqual({ depth: 2, values: 8 })
  })

  it("agrees with the parsed value on a real document, with or without whitespace", () => {
    const doc = sampleDocument()
    for (const text of [JSON.stringify(doc), JSON.stringify(doc, null, 2)])
      expect(jsonTextShape(text, wide).values).toBe(countValues(JSON.parse(text)))
  })

  it("stops at a limit instead of walking hostile input to the end", () => {
    expect(jsonTextShape("[".repeat(1_000_000)).depth).toBe(33)
    expect(jsonTextShape(`[${"0,".repeat(1_000)}0]`, limits).values).toBe(21)
  })
})

describe("shownProblem", () => {
  it("keeps names, ids and indexes; hides hostile keys; makes messages printable", () => {
    const id = "0b5ad9a2-3c4e-4f6a-8b7c-9d0e1f2a3b4c"
    expect(shownProblem({ path: `parts.${id}.anchors.0`, message: "bad" })).toEqual({
      path: `parts.${id}.anchors.0`,
      message: "bad",
    })
    const hostile = "\u202e\n\nThe file is damaged. Visit example.com" + "x".repeat(60_000)
    expect(shownProblem({ path: `parts.${hostile}.name`, message: "a\nb" })).toEqual({
      path: "parts.<invalid key>.name",
      message: "a?b",
    })
  })
})

describe("scanJsonValue", () => {
  it("accepts ordinary JSON", () => {
    expect(scanJsonValue(JSON.parse('{"a":[1,"x",true,null],"b":{"c":2}}'), limits)).toBeNull()
  })

  it("refuses prototype names as keys anywhere, with their path", () => {
    // JSON.parse makes "__proto__" an own key; an object literal would set the prototype.
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const value = JSON.parse(`{"parts":{"p":[{"${key}":1}]}}`) as unknown
      expect(scanJsonValue(value, limits)).toEqual({
        path: `parts.p.0.${key}`,
        message: `reserved key "${key}"`,
      })
    }
  })

  it("reports non-finite numbers (1e400 parses as Infinity)", () => {
    const value = JSON.parse('{"pose":{"positionMm":[0,1e400,0]}}') as unknown
    expect(scanJsonValue(value, limits)).toEqual({
      path: "pose.positionMm.1",
      message: "number out of range",
    })
  })

  it("enforces depth, string, key and count limits", () => {
    expect(scanJsonValue([[[[[1]]]]], limits)?.message).toBe("nested too deeply")
    expect(scanJsonValue({ a: "x".repeat(13) }, limits)).toEqual({
      path: "a",
      message: "text too long",
    })
    expect(scanJsonValue({ ["k".repeat(13)]: 1 }, limits)?.message).toBe("key too long")
    expect(
      scanJsonValue(
        Array.from({ length: 25 }, () => 1),
        limits
      )
    ).toEqual({ path: "", message: "the file holds too many values" })
  })

  it("survives deep values without a stack overflow", () => {
    let deep: unknown = 1
    for (let i = 0; i < 100_000; i++) deep = [deep]
    expect(scanJsonValue(deep)?.message).toBe("nested too deeply")
  })
})
