import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { openSceneBytes, serializeScene } from "./openScene"

const fixture = (name: string) =>
  readFileSync(resolve(process.cwd(), "src/core/schema/testing/fixtures", name))

/**
 * Files earlier builds saved, kept byte for byte (CLAUDE.md §4: a changed meaning needs a
 * migration and a frozen fixture). They must keep opening as the same document.
 */
describe("frozen scene.json fixtures", () => {
  it("opens a Phase 5 file (gated collections empty) unchanged, and saves it back", () => {
    const bytes = fixture("phase5-v1.scene.json")
    const opened = openSceneBytes(new Uint8Array(bytes), "0.1.0")
    if (!opened.ok) throw new Error(JSON.stringify(opened.problems))
    expect(opened.fromVersion).toBe(1)
    expect(opened.document).toEqual(JSON.parse(bytes.toString("utf8")))
    const saved = serializeScene(opened.document, "0.1.0")
    expect(saved.ok && saved.json).toBe(bytes.toString("utf8"))
  })
})
