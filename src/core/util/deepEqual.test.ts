import { describe, expect, it } from "vitest"
import { deepEqual } from "./deepEqual"

describe("deepEqual", () => {
  it("compares nested plain data structurally", () => {
    expect(deepEqual({ a: [1, { b: "x" }] }, { a: [1, { b: "x" }] })).toBe(true)
    expect(deepEqual({ a: [1, { b: "x" }] }, { a: [1, { b: "y" }] })).toBe(false)
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false)
    expect(deepEqual(null, {})).toBe(false)
    expect(deepEqual(Number.NaN, Number.NaN)).toBe(true)
  })

  it("short-circuits on shared references", () => {
    const shared = { big: Array.from({ length: 1000 }, (_, i) => i) }
    expect(deepEqual({ shared, x: 1 }, { shared, x: 1 })).toBe(true)
  })
})
