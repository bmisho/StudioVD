import { describe, expect, it } from "vitest"
import { jsonTextDepth, scanJsonValue } from "./scanJson"

const limits = { maxDepth: 4, maxValues: 20, maxString: 12 }

describe("jsonTextDepth", () => {
  it("counts bracket nesting outside strings, escapes included", () => {
    expect(jsonTextDepth("1")).toBe(0)
    expect(jsonTextDepth('{"a":[1,{"b":[]}]}')).toBe(4)
    expect(jsonTextDepth('{"a":"[[[[{{{{","b":"\\"[["}')).toBe(1)
  })

  it("handles hostile nesting without recursion", () => {
    expect(jsonTextDepth("[".repeat(1_000_000))).toBe(1_000_000)
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
      )?.message
    ).toBe("the file holds too many values")
  })

  it("survives deep values without a stack overflow", () => {
    let deep: unknown = 1
    for (let i = 0; i < 100_000; i++) deep = [deep]
    expect(scanJsonValue(deep)?.message).toBe("nested too deeply")
  })
})
