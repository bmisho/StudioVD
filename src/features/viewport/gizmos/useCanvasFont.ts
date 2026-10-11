import { useEffect, useState } from "react"

/**
 * Returns `font` once the browser has it, `fallback` until then. drei builds the gizmo label
 * textures once per font string, so drawing before Inter has loaded would keep the
 * fallback forever.
 */
export function useCanvasFont(font: string, fallback = "600 18px sans-serif"): string {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    const fonts = typeof document === "undefined" ? undefined : document.fonts
    if (!fonts) return
    fonts.load(font).then(
      () => alive && setReady(true),
      () => undefined // keep the fallback
    )
    return () => {
      alive = false
    }
  }, [font])
  return ready ? font : fallback
}
