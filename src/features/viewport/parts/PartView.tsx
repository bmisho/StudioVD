import { memo, useCallback, useEffect, useMemo } from "react"
import type { Group } from "three"
import type { GeometryAsset, Part } from "@/core/schema"
import { useSessionStore, type SelectionItem } from "@/store/session/sessionStore"
import { PartAnchors } from "@/features/assembly/PartAnchors"
import { PartHighlight, type HighlightState } from "../highlight/PartHighlight"
import { viewportHover } from "../picking/hoverStore"
import { edgeLineMaterial } from "../materials/materialCache"
import { noRaycast, setPickRef } from "../picking/pickTarget"
import { useIsHovered } from "../picking/useIsHovered"
import { registerPartObject } from "./partObjects"
import { partRaycast } from "./partRaycast"
import { useAssetDisplay } from "./useAssetDisplay"
import { usePartMaterial } from "./usePartMaterial"

interface PartViewProps {
  part: Part
  asset: GeometryAsset
  /** Directly selected or below a selected group (computed once by PartsLayer). */
  selected: boolean
}

/** One part at its design pose. Re-renders only when its own props or hover flag change. */
export const PartView = memo(function PartView({ part, asset, selected }: PartViewProps) {
  const item = useMemo<SelectionItem>(() => ({ kind: "part", id: part.id }), [part.id])
  const hovered = useIsHovered(item)
  const mode = useSessionStore((s) => s.displayMode)
  const { geometry, slots, edges, edgeless } = useAssetDisplay(asset, mode !== "shaded")
  const material = usePartMaterial(part, slots, mode)
  // React 19 ref callback with cleanup: the pick mark and the registry entry live exactly as
  // long as the group.
  const register = useCallback(
    (group: Group | null) => {
      if (!group || item.kind !== "part") return
      const unmark = setPickRef(group, item)
      const unregister = registerPartObject(item.id, group)
      return () => {
        unmark()
        unregister()
      }
    },
    [item]
  )
  // A part removed under a still cursor (delete, undo) must not come back pre-highlighted.
  useEffect(() => () => viewportHover.clearIf(item), [item])
  const state: HighlightState = selected ? "selected" : hovered ? "hover" : "none"

  return (
    <group ref={register} position={part.pose.positionMm} quaternion={part.pose.quaternion}>
      <mesh
        geometry={geometry}
        material={material}
        // Wireframe draws edges instead of faces; a part without edges would vanish (yet
        // stay pickable), so it keeps its faces.
        visible={mode !== "wireframe" || edgeless}
        raycast={partRaycast}
      />
      {edges && <lineSegments geometry={edges} material={edgeLineMaterial()} raycast={noRaycast} />}
      <PartHighlight geometry={geometry} state={state} />
      <PartAnchors partId={part.id} partSelected={selected} />
    </group>
  )
})
