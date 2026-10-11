import { useMemo, useRef } from "react"
import { GizmoHelper, GizmoViewport } from "@react-three/drei"
import type { Group } from "three"
import { readSceneTokens } from "../theme/sceneTokens"
import { useCanvasFont } from "./useCanvasFont"
import { useUntonedMaterials } from "./useUntonedMaterials"

const LABEL_FONT = '600 18px "Inter Variable", sans-serif'

/**
 * Axis triad (bottom left). Display only: drei routes its clicks through the tween that
 * changes the camera distance, so it stays disabled. renderPriority 2: the view cube's HUD
 * already renders the main scene.
 */
export function AxisTriad() {
  const tokens = useMemo(() => readSceneTokens(), [])
  const font = useCanvasFont(LABEL_FONT)
  const group = useRef<Group>(null)
  useUntonedMaterials(group, font)

  return (
    <GizmoHelper alignment="bottom-left" margin={[56, 56]} renderPriority={2}>
      <group ref={group}>
        <GizmoViewport
          disabled
          hideNegativeAxes
          axisColors={[tokens.axisX, tokens.axisY, tokens.axisZ]}
          labelColor={tokens.surface}
          font={font}
        />
      </group>
    </GizmoHelper>
  )
}
