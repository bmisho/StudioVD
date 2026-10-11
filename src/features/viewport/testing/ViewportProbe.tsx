import { useEffect, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { Color, SRGBColorSpace, Vector3 } from "three"
import type { RGB8 } from "@/core/math/colorGradient"
import { visibleHeightMm } from "@/core/math/gridLevels"
import { viewSpecOf } from "../camera/useCameraFrame"
import { readSceneTokens } from "../theme/sceneTokens"
import { useViewport } from "../ViewportContext"
import { summarizePixels } from "./pixelStats"
import "./probeTypes"

function rgb8(css: string): RGB8 {
  const o = { r: 0, g: 0, b: 0 }
  new Color().setStyle(css, SRGBColorSpace).getRGB(o, SRGBColorSpace)
  return [Math.round(o.r * 255), Math.round(o.g * 255), Math.round(o.b * 255)]
}

/**
 * Dev-only hook for E2E (`window.__STUDIOVD_VIEWPORT__`): real pixels without
 * preserveDrawingBuffer (render and read in the same task) and the camera state.
 */
export function ViewportProbe() {
  const get = useThree((s) => s.get)
  const { rig } = useViewport()
  const frames = useRef(0)
  useFrame(() => {
    frames.current += 1 // does not force frames in demand mode
  })

  useEffect(() => {
    const tokens = readSceneTokens()
    const background = { top: rgb8(tokens.viewportTop), bottom: rgb8(tokens.viewportBottom) }
    window.__STUDIOVD_VIEWPORT__ = {
      framesRendered: () => frames.current,
      sample: () => {
        const state = get()
        const ctx = state.gl.getContext()
        if (ctx.isContextLost()) return null
        state.advance(performance.now())
        const { drawingBufferWidth: w, drawingBufferHeight: h } = ctx
        const px = new Uint8Array(w * h * 4)
        ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
        const webgl2 =
          typeof WebGL2RenderingContext !== "undefined" && ctx instanceof WebGL2RenderingContext
        return { webgl2, ...summarizePixels(px, w, h, background) }
      },
      camera: () => {
        const c = rig.controls
        const cam = c.camera
        // The controls' own state: the camera object only moves on the next frame's update.
        const target = c.getTarget(new Vector3())
        return {
          type: cam.type === "OrthographicCamera" ? "OrthographicCamera" : "PerspectiveCamera",
          position: c.getPosition(new Vector3()).toArray(),
          target: target.toArray(),
          distance: c.distance,
          zoom: cam.zoom,
          visibleHeight: visibleHeightMm(viewSpecOf(rig)),
        }
      },
      environmentReady: () => get().scene.environment !== null,
      loseContext: () => get().gl.forceContextLoss(),
      restoreContext: () => get().gl.forceContextRestore(),
    }
    return () => {
      delete window.__STUDIOVD_VIEWPORT__
    }
  }, [get, rig])

  return null
}
