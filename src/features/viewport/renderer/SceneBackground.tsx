import { useEffect } from "react"
import { useThree } from "@react-three/fiber"
import { readSceneTokens } from "../theme/sceneTokens"
import { createGradientTexture } from "./gradientTexture"

/** Puts the viewport gradient into the framebuffer (scene.background). */
export function SceneBackground() {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    const tokens = readSceneTokens()
    const texture = createGradientTexture(tokens.viewportTop, tokens.viewportBottom)
    scene.background = texture
    invalidate()
    return () => {
      if (scene.background === texture) scene.background = null
      texture.dispose()
    }
  }, [scene, invalidate])

  return null
}
