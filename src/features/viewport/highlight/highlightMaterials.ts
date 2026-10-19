import {
  AlwaysStencilFunc,
  Color,
  KeepStencilOp,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  ReplaceStencilOp,
} from "three"
import { readSceneTokens } from "@/features/viewport/theme/sceneTokens"
import { HullOutlineMaterial } from "./hullOutlineMaterial"

export interface HighlightMaterials {
  hoverOutline: HullOutlineMaterial
  selectedOutline: HullOutlineMaterial
  selectedTint: MeshBasicMaterial
  /** Marks a highlighted part's silhouette in the stencil buffer, drawing nothing. */
  silhouette: MeshBasicMaterial
}

/** Draw order: parts (0), tint (1, transparent pass), silhouette mask (2), then outlines (3). */
export const SILHOUETTE_ORDER = 2
export const OUTLINE_ORDER = 3
const SILHOUETTE_REF = 1

/**
 * The outline is the part's back faces pushed outward. Opaque parts hide those faces inside
 * their own silhouette by depth; transparent, X-ray and wireframe parts write no depth, so the
 * outline only draws where the stencil does not hold the silhouette mask.
 */
function outsideSilhouette(outline: HullOutlineMaterial): HullOutlineMaterial {
  outline.stencilWrite = true // enables the stencil test; Keep ops leave the buffer as is
  outline.stencilRef = SILHOUETTE_REF
  outline.stencilFunc = NotEqualStencilFunc
  outline.stencilFail = KeepStencilOp
  outline.stencilZFail = KeepStencilOp
  outline.stencilZPass = KeepStencilOp
  return outline
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
    hoverOutline: outsideSilhouette(new HullOutlineMaterial(color, HOVER_OUTLINE_PX)),
    selectedOutline: outsideSilhouette(new HullOutlineMaterial(color, SELECTED_OUTLINE_PX)),
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
    // Not depth-tested: the whole silhouette, also where another part is in front of it.
    silhouette: new MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      stencilWrite: true,
      stencilRef: SILHOUETTE_REF,
      stencilFunc: AlwaysStencilFunc,
      stencilZPass: ReplaceStencilOp,
    }),
  }
  return shared
}
