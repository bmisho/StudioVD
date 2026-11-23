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
  it("opens a Phase 5 file (v1, gated collections empty) as v3 with no connectors", () => {
    const bytes = fixture("phase5-v1.scene.json")
    const opened = openSceneBytes(new Uint8Array(bytes), "0.1.0")
    if (!opened.ok) throw new Error(JSON.stringify(opened.problems))
    expect(opened.fromVersion).toBe(1)
    const v1 = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>
    expect(opened.document).toEqual({ ...v1, schemaVersion: 3, connectors: {} })
    // Saved, it is a current file that opens unchanged.
    const saved = serializeScene(opened.document, "0.1.0")
    if (!saved.ok) throw new Error("not saved")
    const again = openSceneBytes(new TextEncoder().encode(saved.json), "0.1.0")
    expect(again.ok && again.fromVersion).toBe(3)
    expect(again.ok && again.document).toEqual(opened.document)
  })

  it("opens a Phase 9 file (v2: a belt, a tube and a spring) as v3, unchanged", () => {
    const bytes = fixture("phase9-v2.scene.json")
    const opened = openSceneBytes(new Uint8Array(bytes), "0.1.0")
    if (!opened.ok) throw new Error(JSON.stringify(opened.problems))
    expect(opened.fromVersion).toBe(2)
    const v2 = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>
    expect(opened.document).toEqual({ ...v2, schemaVersion: 3 })
    const saved = serializeScene(opened.document, "0.1.0")
    if (!saved.ok) throw new Error("not saved")
    const again = openSceneBytes(new TextEncoder().encode(saved.json), "0.1.0")
    expect(again.ok && again.document).toEqual(opened.document)
  })
})
