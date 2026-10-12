import { useLayoutEffect, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import { Vector3 } from "three"
import { gridFadeRadiusMm, gridLevel, visibleHeightMm } from "@/core/math/gridLevels"
import { viewSpecOf } from "../camera/useCameraFrame"
import { readSceneTokens } from "../theme/sceneTokens"
import { useViewport } from "../ViewportContext"
import { createGridMaterial, setGridUniforms } from "./gridMaterial"
import { OVERLAY } from "../thumbnail/overlay"

// Not pickable: otherwise every click on empty space hits the grid, and clicking empty
// space no longer clears the selection.
const noRaycast = (): void => undefined
const target = new Vector3()

/** Ground grid with zoom-dependent spacing (10 mm / 100 mm at typical framing). */
export function CadGrid() {
  const { rig } = useViewport()
  const material = useMemo(() => createGridMaterial(readSceneTokens()), [])
  useLayoutEffect(() => () => material.dispose(), [material])

  // Updates uniforms only on frames that render anyway; never invalidates (demand stays idle).
  useFrame(({ size }) => {
    rig.controls.getTarget(target)
    const view = viewSpecOf(rig)
    const level = gridLevel(visibleHeightMm(view) / Math.max(1, size.height))
    const radius = gridFadeRadiusMm(view, size.width / Math.max(1, size.height))
    setGridUniforms(material, level, radius, target.x, target.z)
  })

  return (
    <mesh
      material={material}
      frustumCulled={false}
      renderOrder={-1}
      raycast={noRaycast}
      userData={OVERLAY}
    >
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
