import type { RootState } from "@react-three/fiber"
import type { Object3D } from "three"
import { readSceneTokens } from "../theme/sceneTokens"
import { encodeThumbnail, toImagePixels } from "./encodeThumbnail"
import { isOverlay } from "./overlay"

/**
 * The assembly as the user sees it, without grid, highlights or gizmos (PLAN 5.5). Renders
 * and reads in one task (the canvas does not preserve its drawing buffer), then renders the
 * normal frame again, so nothing flickers. Null when there is nothing to read: a collapsed
 * pane, a lost context.
 */
export async function captureThumbnail(state: RootState): Promise<Uint8Array | null> {
  const { gl, scene, camera } = state
  const ctx = gl.getContext()
  const { drawingBufferWidth: w, drawingBufferHeight: h } = ctx
  if (ctx.isContextLost() || w < 64 || h < 64) return null
  const hidden: Object3D[] = []
  scene.traverse((object) => {
    if (object.visible && isOverlay(object)) {
      object.visible = false
      hidden.push(object)
    }
  })
  const px = new Uint8Array(w * h * 4)
  try {
    gl.render(scene, camera)
    ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
  } finally {
    for (const object of hidden) object.visible = true
    state.advance(performance.now())
  }
  return encodeThumbnail(toImagePixels(px, w, h), w, h, readSceneTokens().viewportTop)
}
