import { memo, useCallback, useEffect, useMemo } from "react"
import type { Group } from "three"
import type { GeometryAsset, Part } from "@/core/schema"
import type { SelectionItem } from "@/store/session/sessionStore"
import { PartHighlight, type HighlightState } from "../highlight/PartHighlight"
import { viewportHover } from "../picking/hoverStore"
import { setPickRef } from "../picking/pickTarget"
import { useIsHovered } from "../picking/useIsHovered"
import { assetBoxGeometry } from "./assetBoxGeometry"
import { defaultPartMaterial } from "./defaultPartMaterial"
import { registerPartObject } from "./partObjects"

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
  const geometry = assetBoxGeometry(asset)
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
      {/* Phase 6 resolves part.materialId; one shared neutral material until then. */}
      <mesh geometry={geometry} material={defaultPartMaterial()} />
      <PartHighlight geometry={geometry} state={state} />
    </group>
  )
})
