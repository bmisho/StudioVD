import { describe, expect, it } from "vitest"
import { uniqueAnchorName } from "./anchorNames"

describe("uniqueAnchorName", () => {
  it("numbers repeats from 2, filling the first gap", () => {
    expect(uniqueAnchorName("Face", [])).toBe("Face")
    expect(uniqueAnchorName("Face", ["Face"])).toBe("Face 2")
    expect(uniqueAnchorName("Face", ["Face", "Face 2", "Face 4"])).toBe("Face 3")
    expect(uniqueAnchorName("Hole Ø8", ["Face", "Hole Ø6"])).toBe("Hole Ø8")
  })
})
