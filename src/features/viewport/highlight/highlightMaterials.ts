import { Color, MeshBasicMaterial } from "three"
import { readSceneTokens } from "@/features/viewport/theme/sceneTokens"
import { HullOutlineMaterial } from "./hullOutlineMaterial"

export interface HighlightMaterials {
  hoverOutline: HullOutlineMaterial
  selectedOutline: HullOutlineMaterial
  selectedTint: MeshBasicMaterial
}

/** Width in CSS px. Hover is thinner and has no fill, so the two never look alike. */
export const HOVER_OUTLINE_PX = 2
export const SELECTED_OUTLINE_PX = 3
export const SELECTED_TINT_OPACITY = 0.25

let shared: HighlightMaterials | null = null

/**
 * Shared by every part (3 programs total). Lives as long as the app: the canvas and its
 * WebGL context are never remounted (CLAUDE.md §4), so there is nothing to dispose.
 */
export function highlightMaterials(): HighlightMaterials {
  if (shared) return shared
  // sRGB hex -> linear working colour; toneMapped=false outputs the exact token again.
  const color = new Color(readSceneTokens().highlight)
  shared = {
    hoverOutline: new HullOutlineMaterial(color, HOVER_OUTLINE_PX),
    selectedOutline: new HullOutlineMaterial(color, SELECTED_OUTLINE_PX),
    selectedTint: new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: SELECTED_TINT_OPACITY,
      depthWrite: false,
      // Pulled toward the camera so it wins the depth test against the part's own surface.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      toneMapped: false,
    }),
  }
  return shared
}
