import { useMemo } from "react"
import type { BufferGeometry } from "three"
import { noRaycast } from "../picking/pickTarget"
import { highlightMaterials } from "./highlightMaterials"
import { ensureHullNormals } from "./hullGeometry"
import { syncOutlineUniforms } from "./hullOutlineMaterial"
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
  if (state === "none") return null
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
        geometry={outlineGeometry}
        material={state === "selected" ? m.selectedOutline : m.hoverOutline}
        raycast={noRaycast}
        onBeforeRender={syncOutlineUniforms}
        userData={OVERLAY}
      />
    </>
  )
}
