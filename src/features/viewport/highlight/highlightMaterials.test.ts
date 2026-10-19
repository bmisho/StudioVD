import { NotEqualStencilFunc, ReplaceStencilOp, KeepStencilOp } from "three"
import { describe, expect, it, vi } from "vitest"
import { highlightMaterials, OUTLINE_ORDER, SILHOUETTE_ORDER } from "./highlightMaterials"

vi.mock("@/features/viewport/theme/sceneTokens", () => ({
  readSceneTokens: () => ({ highlight: "#0ea5e9" }),
}))

describe("highlight materials", () => {
  it("draw the outline only outside the part's stencil silhouette", () => {
    const m = highlightMaterials()
    expect(m.silhouette).toMatchObject({
      colorWrite: false,
      depthWrite: false,
      depthTest: false, // the whole silhouette, also behind other parts
      stencilWrite: true,
      stencilRef: 1,
      stencilZPass: ReplaceStencilOp,
    })
    for (const outline of [m.hoverOutline, m.selectedOutline]) {
      expect(outline).toMatchObject({
        stencilWrite: true, // what turns the stencil test on in three
        stencilRef: 1,
        stencilFunc: NotEqualStencilFunc,
        stencilZPass: KeepStencilOp,
      })
    }
    expect(SILHOUETTE_ORDER).toBeLessThan(OUTLINE_ORDER)
  })
})
