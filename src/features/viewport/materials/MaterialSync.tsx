import { useEffect } from "react"
import { useThree } from "@react-three/fiber"
import { useDocumentStore } from "@/store/document/documentStore"
import { TRANSMISSION_RESOLUTION_SCALE } from "../renderer/rendererConfig"
import { materialCache } from "./materialCache"
import { textureCache } from "./textureCache"

/**
 * Keeps the shared three.js materials in step with the document's materials. Edits change the
 * cached materials in place, so a slider scrub re-renders no part components; the canvas
 * only needs a redraw (demand frameloop). Textures that finish loading do the same.
 */
export function MaterialSync() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const materials = useDocumentStore((s) => s.doc.materials)
  const textures = useDocumentStore((s) => s.doc.textures)

  useEffect(() => {
    gl.transmissionResolutionScale = TRANSMISSION_RESOLUTION_SCALE
  }, [gl])

  useEffect(() => {
    if (materialCache.sync({ materials, textures })) invalidate()
    return textureCache.subscribe(() => {
      materialCache.sync({ materials, textures })
      invalidate()
    })
  }, [materials, textures, invalidate])

  return null
}
