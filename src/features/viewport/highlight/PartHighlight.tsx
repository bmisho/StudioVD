import { useLayoutEffect, useMemo, useRef } from "react"
import type { BufferGeometry, Camera, Material, Scene, WebGLRenderer } from "three"
import { noRaycast } from "../picking/pickTarget"
import { useRedrawOnRemoval } from "../renderer/useRedrawOnRemoval"
import { highlightMaterials, OUTLINE_ORDER, SILHOUETTE_ORDER } from "./highlightMaterials"
import { ensureHullNormals } from "./hullGeometry"
import { syncOutlineUniforms } from "./hullOutlineMaterial"
import { acquireStencilBit, applyStencilBit, releaseStencilBit } from "./stencilBits"
import { OVERLAY } from "../thumbnail/overlay"

export type HighlightState = "none" | "hover" | "selected"

/** Overlay meshes for one part; children of the part's group so they follow its pose. */
export function PartHighlight({
  geometry,
  state,
}: {
  geometry: BufferGeometry
  state: HighlightState
}) {
  const outlineGeometry = useMemo(() => ensureHullNormals(geometry), [geometry])
  const lit = state !== "none"
  useRedrawOnRemoval(state) // hover out, deselect: the tint and outline go
  // Read at draw time: no re-render when the bit is handed out (before the first frame).
  const bit = useRef(1)
  useLayoutEffect(() => {
    if (!lit) return
    const own = acquireStencilBit()
    bit.current = own
    return () => releaseStencilBit(own)
  }, [lit])
  const draw = useMemo(() => {
    type Before = (r: WebGLRenderer, s: Scene, c: Camera, g: BufferGeometry, m: Material) => void
    const silhouette: Before = (_r, _s, _c, _g, material) => applyStencilBit(material, bit.current)
    const outline: Before = (renderer, scene, camera, g, material) => {
      syncOutlineUniforms(renderer, scene, camera, g, material)
      applyStencilBit(material, bit.current)
    }
    return { silhouette, outline }
  }, [])
  if (!lit) return null
  const m = highlightMaterials()
  return (
    <>
      {state === "selected" && (
        <mesh
          geometry={geometry}
          material={m.selectedTint}
          raycast={noRaycast}
          renderOrder={1}
          userData={OVERLAY}
        />
      )}
      <mesh
        geometry={geometry}
        material={m.silhouette}
        raycast={noRaycast}
        renderOrder={SILHOUETTE_ORDER}
        onBeforeRender={draw.silhouette}
        userData={OVERLAY}
      />
      <mesh
        geometry={outlineGeometry}
        material={state === "selected" ? m.selectedOutline : m.hoverOutline}
        raycast={noRaycast}
        renderOrder={OUTLINE_ORDER}
        onBeforeRender={draw.outline}
        userData={OVERLAY}
      />
    </>
  )
}
