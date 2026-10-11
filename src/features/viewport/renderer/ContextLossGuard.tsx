import { useEffect } from "react"
import { useThree } from "@react-three/fiber"
import { useSessionStore } from "@/store/session/sessionStore"

const GIVE_UP_MS = 10_000

/**
 * R3F has no context-loss handling. three preventDefault()s 'webglcontextlost' (which is what
 * allows a restore) and rebuilds its GL state on 'webglcontextrestored'; in demand mode
 * nothing redraws until someone invalidates. If the context never comes back, `onGiveUp`
 * lets the panel error boundary remount the view with a fresh context.
 */
export function ContextLossGuard({ onGiveUp }: { onGiveUp: () => void }) {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const setViewportGpu = useSessionStore((s) => s.setViewportGpu)

  useEffect(() => {
    const canvas = gl.domElement
    let timer: ReturnType<typeof setTimeout> | undefined
    // Never stopPropagation here: three's own listener must still run.
    const lost = () => {
      setViewportGpu("lost")
      timer = setTimeout(onGiveUp, GIVE_UP_MS)
    }
    const restored = () => {
      clearTimeout(timer)
      setViewportGpu("ready")
      invalidate()
    }
    canvas.addEventListener("webglcontextlost", lost)
    canvas.addEventListener("webglcontextrestored", restored)
    setViewportGpu("ready")
    return () => {
      clearTimeout(timer)
      canvas.removeEventListener("webglcontextlost", lost)
      canvas.removeEventListener("webglcontextrestored", restored)
      setViewportGpu("starting")
    }
  }, [gl, invalidate, setViewportGpu, onGiveUp])

  return null
}
