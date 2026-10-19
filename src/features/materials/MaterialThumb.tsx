import { useEffect, useRef, useSyncExternalStore } from "react"
import type { Material as ThreeMaterial } from "three"
import { PREVIEW_SPHERE_FILL } from "@/features/viewport/thumbnail/previewScene"
import { cn } from "@/lib/utils"
import { previewCache } from "./previewCache"

const subscribe = (listener: () => void) => previewCache.subscribe(listener)

/** Device pixels for `cssPx` at the current pixel ratio (previews are cached per size). */
const devicePx = (cssPx: number) =>
  Math.round(cssPx * (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1))

/**
 * A material's preview sphere (PLAN 6.3), rendered by the 3D view's renderer and cached. Until
 * it arrives, or when the 3D view cannot render, a flat disc in the material's colour.
 * Pixels go straight into a canvas: no data: or blob: URLs (the CSP will not allow them).
 */
export function MaterialThumb({
  appearanceKey,
  material,
  fallbackColor,
  sizePx,
  label,
  className,
}: {
  appearanceKey: string
  material: ThreeMaterial
  /** sRGB `#rrggbb` (the material's own colour: user data, not a theme token). */
  fallbackColor: string
  sizePx: number
  /** Accessible name; without one the picture is decorative (its control names it). */
  label?: string
  className?: string
}) {
  const px = devicePx(sizePx)
  const canvas = useRef<HTMLCanvasElement>(null)
  const image = useSyncExternalStore(subscribe, () => previewCache.get(appearanceKey, px))
  useEffect(() => {
    if (!image) previewCache.request(appearanceKey, material, px)
  }, [appearanceKey, material, px, image])

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d")
    if (!ctx) return // no 2D canvas (jsdom): the element still has its label
    ctx.clearRect(0, 0, px, px)
    if (image) return ctx.putImageData(image, 0, 0)
    ctx.fillStyle = fallbackColor
    ctx.beginPath()
    ctx.arc(px / 2, px / 2, (px * PREVIEW_SPHERE_FILL) / 2, 0, 2 * Math.PI)
    ctx.fill()
  }, [image, fallbackColor, px])

  return (
    <canvas
      ref={canvas}
      width={px}
      height={px}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={cn("shrink-0", className)}
      style={{ width: sizePx, height: sizePx }}
    />
  )
}
