import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { caseCollisions, findCaseCollisions } from "./caseCollisions.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

describe("names a case-insensitive disk can tell apart", () => {
  it("finds names and module names that differ only by case", () => {
    expect(caseCollisions(["AnchorPreview.tsx", "anchorPreview.ts", "glyphs.ts"])).toEqual([
      ["AnchorPreview.tsx", "anchorPreview.ts"],
    ])
    expect(caseCollisions(["Readme.md", "README.md"])).toEqual([["README.md", "Readme.md"]])
    expect(caseCollisions(["Views", "views.ts"])).toEqual([["Views", "views.ts"]])
    // One module's files, spelled alike, are fine.
    expect(caseCollisions(["anchorTool.ts", "anchorTool.test.ts", "AnchorGlyph.tsx"])).toEqual([])
  })

  it("the repository has none (Windows is the main target; CI runs on Linux)", () => {
    expect(findCaseCollisions(root)).toEqual([])
  })
})
