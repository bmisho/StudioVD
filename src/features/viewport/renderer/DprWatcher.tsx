import { useEffect } from "react"
import { useThree } from "@react-three/fiber"
import { DPR } from "./rendererConfig"

/**
 * R3F re-reads devicePixelRatio only when the canvas re-renders, so moving the window to a
 * monitor with different scaling leaves the image blurry or oversized. A resolution media
 * query fires exactly when the ratio changes.
 */
export function DprWatcher() {
  const setDpr = useThree((s) => s.setDpr)

  useEffect(() => {
    let query: MediaQueryList | null = null
    const onChange = () => {
      setDpr(DPR)
      listen()
    }
    const listen = () => {
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      query.addEventListener("change", onChange, { once: true })
    }
    listen()
    return () => query?.removeEventListener("change", onChange)
  }, [setDpr])

  return null
}
