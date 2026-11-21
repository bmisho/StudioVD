import { describe, expect, it } from "vitest"
import { quantity, signalText } from "./format"

describe("result text", () => {
  it("glues prefixes to units and keeps a space otherwise", () => {
    expect(quantity(0.0047, "A")).toBe("4.7 mA")
    expect(quantity(9, "V")).toBe("9 V")
    expect(quantity(6e5, "Pa")).toBe("600 kPa")
    expect(quantity(3e-15, "A")).toBe("0 A")
    expect(quantity(NaN, "V")).toBe("—")
    expect(quantity(12, "")).toBe("12")
  })

  it("says bools as on and off", () => {
    expect(signalText(true)).toBe("on")
    expect(signalText(undefined)).toBe("—")
    expect(signalText(716, "")).toBe("716")
  })
})
