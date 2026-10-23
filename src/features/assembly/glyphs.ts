import type { RootState } from "@react-three/fiber"
import { Vector3, type Object3D } from "three"
import type { AnchorId } from "@/core/schema"

/**
 * Anchor glyphs on screen (PLAN 7.4): drawn in CSS pixels, so each frame every glyph is scaled
 * to the world size of one pixel where it stands; and found again by screen distance when the
 * viewport is clicked (a glyph of a few pixels is too small to raycast). Transient wiring
 * (CLAUDE.md §4 kind 3): plain module state, never Zustand.
 */
interface Glyph {
  object: Object3D
  /** Placed anchors can be clicked; the Place Anchor preview cannot. */
  anchor: AnchorId | null
}

const glyphs = new Set<Glyph>()
let view: (() => RootState) | null = null

/** How close (CSS px) a click must be to an anchor's origin to select it. */
export const ANCHOR_PICK_PX = 8

/** Registers a glyph's root object; returns its unregister. */
export function registerGlyph(object: Object3D, anchor: AnchorId | null): () => void {
  const glyph = { object, anchor }
  glyphs.add(glyph)
  return () => glyphs.delete(glyph)
}

/** The viewport whose camera glyphs are sized and picked with (GlyphScaler mounts it). */
export function attachGlyphView(get: () => RootState): () => void {
  view = get
  return () => {
    if (view === get) view = null
  }
}

const world = new Vector3()
const ndc = new Vector3()
const scratch = new Vector3()

/** World size of one CSS pixel at `point` for this camera and canvas height. */
function worldPerPixel(state: RootState, point: Vector3): number {
  const camera = state.camera
  const height = Math.max(1, state.size.height)
  if ("isOrthographicCamera" in camera && camera.isOrthographicCamera)
    return (camera.top - camera.bottom) / camera.zoom / height
  const depth = Math.max(1e-6, -scratch.copy(point).applyMatrix4(camera.matrixWorldInverse).z)
  const fov = "fov" in camera && typeof camera.fov === "number" ? camera.fov : 50
  return (2 * depth * Math.tan((fov * Math.PI) / 360)) / height
}

/** Before every frame: each glyph one world unit per CSS pixel (geometry is in pixels). */
export function scaleGlyphs(state: RootState): void {
  state.camera.updateMatrixWorld()
  for (const { object } of glyphs) {
    object.parent?.updateWorldMatrix(true, false)
    object.getWorldPosition(world)
    object.scale.setScalar(worldPerPixel(state, world))
  }
}

/** The anchor whose glyph origin is nearest a client point, within ANCHOR_PICK_PX, or null. */
export function anchorAt(clientX: number, clientY: number): AnchorId | null {
  const state = view?.()
  if (!state) return null
  const rect = state.gl.domElement.getBoundingClientRect()
  let best: AnchorId | null = null
  let bestD = ANCHOR_PICK_PX
  for (const { object, anchor } of glyphs) {
    if (!anchor || !isShown(object)) continue
    ndc.copy(object.getWorldPosition(world)).project(state.camera)
    if (ndc.z > 1) continue // behind the camera
    const x = rect.left + ((ndc.x + 1) / 2) * rect.width
    const y = rect.top + ((1 - ndc.y) / 2) * rect.height
    const d = Math.hypot(x - clientX, y - clientY)
    if (d <= bestD) {
      best = anchor
      bestD = d
    }
  }
  return best
}

/** Visible itself and through every ancestor (a hidden part hides its anchors). */
function isShown(object: Object3D): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false
  return true
}
