import { useEffect, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { Color, SRGBColorSpace, Vector3 } from "three"
import type { RGB8 } from "@/core/math/colorGradient"
import { visibleHeightMm } from "@/core/math/gridLevels"
import { anchorPreview } from "@/features/assembly/anchorPreview"
import { useDocumentStore } from "@/store/document/documentStore"
import { viewSpecOf } from "../camera/useCameraFrame"
import { redrawNow } from "../renderer/redrawNow"
import { readSceneTokens } from "../theme/sceneTokens"
import { useViewport } from "../ViewportContext"
import { viewportHover } from "../picking/hoverStore"
import { countColour, summarizePixels } from "./pixelStats"
import { gizmoState } from "../gizmos/gizmoState"
import { partLook, partMesh, partPose, pickAt, projectPart, projectPoint } from "./probeQueries"
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
  const { rig, partsRoot, partGrab } = useViewport()
  const frames = useRef(0)
  useFrame(() => {
    frames.current += 1 // does not force frames in demand mode
  })

  useEffect(() => {
    const tokens = readSceneTokens()
    const background = { top: rgb8(tokens.viewportTop), bottom: rgb8(tokens.viewportBottom) }
    const highlight = rgb8(tokens.highlight)
    // preserveDrawingBuffer is off: render and read in the same task.
    const renderAndRead = () => {
      const state = get()
      const ctx = state.gl.getContext()
      if (ctx.isContextLost()) return null
      redrawNow(state)
      const { drawingBufferWidth: w, drawingBufferHeight: h } = ctx
      const px = new Uint8Array(w * h * 4)
      ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
      return { ctx, px, w, h }
    }
    /** RGB under a client point, from a frame read in this task. */
    const rgbAt = (frame: { px: Uint8Array; w: number; h: number }, x: number, y: number) => {
      const rect = get().gl.domElement.getBoundingClientRect()
      const px = Math.floor(((x - rect.left) / rect.width) * frame.w)
      const py = Math.floor(((rect.bottom - y) / rect.height) * frame.h) // GL rows go up
      const at = 4 * (py * frame.w + px)
      return [frame.px[at] ?? 0, frame.px[at + 1] ?? 0, frame.px[at + 2] ?? 0] as [
        number,
        number,
        number,
      ]
    }
    window.__STUDIOVD_VIEWPORT__ = {
      framesRendered: () => frames.current,
      sample: () => {
        const frame = renderAndRead()
        if (!frame) return null
        const { ctx, px, w, h } = frame
        const webgl2 =
          typeof WebGL2RenderingContext !== "undefined" && ctx instanceof WebGL2RenderingContext
        return { webgl2, ...summarizePixels(px, w, h, background) }
      },
      pixelAt: (x, y) => {
        const frame = renderAndRead()
        return frame ? rgbAt(frame, x, y) : null
      },
      pixelsAt: (points) => {
        const frame = renderAndRead()
        return frame ? points.map((p) => rgbAt(frame, p.x, p.y)) : null
      },
      highlightPixels: (tolerance = 2) => {
        const frame = renderAndRead()
        return frame ? countColour(frame.px, highlight, tolerance) : 0
      },
      project: (point) => projectPoint(get(), point),
      projectPart: (id) => projectPart(get(), id),
      pickAt: (x, y) => pickAt(get(), partsRoot.current, x, y),
      hoveredId: () => viewportHover.get()?.id ?? null,
      partPose,
      partMesh,
      partLook,
      anchors: () =>
        Object.values(useDocumentStore.getState().doc.anchors).map((a) => ({
          id: a.id,
          partId: a.partId,
          kind: a.kind,
          name: a.name ?? null,
          frame: a.frame,
        })),
      anchorPreview: () => {
        const p = anchorPreview.get()
        if (!p) return null
        const { snap, kind, name } = p.candidate
        return { partId: p.partId, snap, kind, name }
      },
      gizmoAxis: () => gizmoState.axis(),
      dragReady: () => partGrab.current !== null,
      parts: () =>
        Object.values(useDocumentStore.getState().doc.parts).map(({ id, name }) => ({ id, name })),
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
  }, [get, rig, partsRoot, partGrab])

  return null
}
