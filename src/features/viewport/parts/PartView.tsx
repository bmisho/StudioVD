import { memo, useCallback, useEffect, useMemo } from "react"
import type { Group } from "three"
import type { GeometryAsset, Part } from "@/core/schema"
import type { SelectionItem } from "@/store/session/sessionStore"
import { PartHighlight, type HighlightState } from "../highlight/PartHighlight"
import { viewportHover } from "../picking/hoverStore"
import { setPickRef } from "../picking/pickTarget"
import { useIsHovered } from "../picking/useIsHovered"
import { registerPartObject } from "./partObjects"
import { useAssetDisplay } from "./useAssetDisplay"

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
  const { geometry, material } = useAssetDisplay(asset)
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
      {/* Source colours until Phase 6 resolves part.materialId. */}
      <mesh geometry={geometry} material={material} />
      <PartHighlight geometry={geometry} state={state} />
    </group>
  )
})
