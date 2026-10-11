import { useEffect, useLayoutEffect, useState } from "react"
import { useThree } from "@react-three/fiber"
import { PMREMGenerator } from "three"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { STUDIO_LIGHTING } from "./lightingPreset"

/**
 * Image-based lighting generated locally from three's RoomEnvironment: no HDRI download
 * (drei's Environment presets fetch from a CDN). Without it, metal parts render black.
 * The PMREM target lives on the GPU only, so it is rebuilt after a context restore.
 */
export function StudioEnvironment() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    const canvas = gl.domElement
    const restored = () => setEpoch((n) => n + 1)
    canvas.addEventListener("webglcontextrestored", restored)
    return () => canvas.removeEventListener("webglcontextrestored", restored)
  }, [gl])

  useLayoutEffect(() => {
    const { pmremSize, sigma, intensity } = STUDIO_LIGHTING.environment
    const pmrem = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    // Direction-only lighting, so the millimetre scene scale does not matter here.
    const target = pmrem.fromScene(room, sigma, 0.1, 100, { size: pmremSize })
    room.dispose()
    pmrem.dispose()
    scene.environment = target.texture
    scene.environmentIntensity = intensity
    invalidate()
    return () => {
      if (scene.environment === target.texture) scene.environment = null
      target.dispose()
    }
  }, [gl, scene, invalidate, epoch])

  return null
}
