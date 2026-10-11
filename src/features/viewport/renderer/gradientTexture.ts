import { Color, DataTexture, LinearFilter, RGBAFormat, SRGBColorSpace } from "three"
import { verticalGradientRGBA, type RGB8 } from "@/core/math/colorGradient"

const ROWS = 256

function rgb8(css: string): RGB8 {
  const c = new Color().setStyle(css, SRGBColorSpace)
  const out = { r: 0, g: 0, b: 0 }
  c.getRGB(out, SRGBColorSpace)
  return [Math.round(out.r * 255), Math.round(out.g * 255), Math.round(out.b * 255)]
}

/**
 * Vertical background gradient as an sRGB texture. three does not tone-map sRGB background
 * textures, so the framebuffer shows the theme tokens exactly; thumbnails and pixel reads
 * include the background (a CSS gradient behind a transparent canvas would not).
 */
export function createGradientTexture(topCss: string, bottomCss: string): DataTexture {
  const texture = new DataTexture(
    verticalGradientRGBA(rgb8(topCss), rgb8(bottomCss), ROWS),
    1,
    ROWS,
    RGBAFormat
  )
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}
