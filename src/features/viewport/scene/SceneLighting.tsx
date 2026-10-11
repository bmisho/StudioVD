import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { DirectionalLight } from "three"
import { readSceneTokens } from "../theme/sceneTokens"
import { STUDIO_LIGHTING } from "./lightingPreset"

/**
 * Hemisphere fill plus a key and a fill light locked to the camera, so every view is lit
 * from the viewer's side. Directional lights only need a direction; their targets stay at
 * the world origin.
 */
export function SceneLighting() {
  const tokens = useMemo(() => readSceneTokens(), [])
  const key = useRef<DirectionalLight>(null)
  const fill = useRef<DirectionalLight>(null)

  useFrame(({ camera }) => {
    key.current?.position
      .set(...STUDIO_LIGHTING.key.cameraDir)
      .normalize()
      .applyQuaternion(camera.quaternion)
    fill.current?.position
      .set(...STUDIO_LIGHTING.fill.cameraDir)
      .normalize()
      .applyQuaternion(camera.quaternion)
  })

  return (
    <>
      <hemisphereLight args={[tokens.surface, tokens.viewportBottom, STUDIO_LIGHTING.hemisphere]} />
      <directionalLight ref={key} intensity={STUDIO_LIGHTING.key.intensity} />
      <directionalLight ref={fill} intensity={STUDIO_LIGHTING.fill.intensity} />
    </>
  )
}
