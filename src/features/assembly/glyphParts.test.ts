import { describe, expect, it, vi } from "vitest"
import { glyphParts } from "./glyphParts"

vi.mock("@/features/viewport/theme/sceneTokens", async () => {
  const { flatSceneTokens } = await import("@/test/demandRoot")
  return { readSceneTokens: flatSceneTokens }
})

describe("glyph materials", () => {
  it("are all transparent, so they draw in three's last pass, after parts, glass and tints", () => {
    const p = glyphParts()
    for (const m of [p.main, p.mainGhost, p.x, p.plate]) expect(m.transparent).toBe(true)
    expect([p.main.opacity, p.x.opacity]).toEqual([1, 1]) // solid ones still look solid
  })
})
