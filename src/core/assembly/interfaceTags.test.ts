import { describe, expect, it } from "vitest"
import { tagsFit } from "./interfaceTags"

describe("interface tags", () => {
  it("fit a part that goes in with the part it goes into, the rest equal", () => {
    expect(tagsFit("shaft-8mm", "bore-8mm")).toBe(true)
    expect(tagsFit("M3-hole", "m3_screw")).toBe(true) // case and separators do not matter
    expect(tagsFit("pin 5", "socket 5")).toBe(true)
    expect(tagsFit("rail-2020", "rail-2020")).toBe(true) // the same tag
  })

  it("do not fit two of a kind, another size, or no tag", () => {
    expect(tagsFit("shaft-8mm", "shaft-8mm-extra")).toBe(false)
    expect(tagsFit("shaft-8mm", "pin-8mm")).toBe(false) // both go in
    expect(tagsFit("shaft-8mm", "bore-8")).toBe(false) // 8mm is not 8
    expect(tagsFit("shaft-8mm", undefined)).toBe(false)
    expect(tagsFit("", "")).toBe(false)
    expect(tagsFit("bolt-hole", "bolt-hole-2")).toBe(false) // both roles in one tag: none
    expect(tagsFit("shaft-8mm", "shaft-8mm")).toBe(false) // two shafts, though the tags are equal
    expect(tagsFit("M3-screw", "m3 screw")).toBe(false)
  })
})
