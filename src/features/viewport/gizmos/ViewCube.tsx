import { useCallback, useMemo, useRef } from "react"
import { GizmoHelper, GizmoViewcube } from "@react-three/drei"
import type { ThreeEvent } from "@react-three/fiber"
import type { Group } from "three"
import { cubeHitDirection } from "@/core/math/standardViews"
import { readSceneTokens } from "../theme/sceneTokens"
import { viewportBridge } from "../viewportBridge"
import { useCanvasFont } from "./useCanvasFont"
import { useUntonedMaterials } from "./useUntonedMaterials"

const CUBE_FONT = '600 18px "Inter Variable", sans-serif'

/**
 * View cube (top right). Clicks go through the viewport bridge to camera-controls, which
 * keeps the orbit target and distance; drei's built-in tween measures the radius from the
 * world origin and changes the distance. This HUD uses renderPriority 1, so it also renders
 * the main scene: exactly one HUD may do that.
 */
export function ViewCube() {
  const tokens = useMemo(() => readSceneTokens(), [])
  const font = useCanvasFont(CUBE_FONT)
  const group = useRef<Group>(null)
  useUntonedMaterials(group, font)

  const onClick = useCallback((e: ThreeEvent<MouseEvent>): null => {
    e.stopPropagation()
    const n = e.face?.normal
    const p = e.object.position
    const direction = cubeHitDirection([p.x, p.y, p.z], n ? [n.x, n.y, n.z] : null)
    if (direction) viewportBridge.setView(direction)
    return null
  }, [])

  return (
    <GizmoHelper alignment="top-right" margin={[72, 72]} renderPriority={1}>
      <group ref={group}>
        <GizmoViewcube
          font={font}
          color={tokens.surface}
          hoverColor={tokens.hover}
          textColor={tokens.text}
          strokeColor={tokens.stroke}
          onClick={onClick}
        />
      </group>
    </GizmoHelper>
  )
}
