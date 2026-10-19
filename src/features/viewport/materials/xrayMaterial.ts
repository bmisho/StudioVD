import { DoubleSide, MultiplyBlending, ShaderMaterial, type Color } from "three"

// Defaults. A closed solid is two surfaces (DoubleSide), so a face seen head-on filters
// twice. Power 3 keeps flat faces light in the usual views: a box face in an isometric view
// (|N.V| = 1/sqrt 3) gets a = 0.17 (power 2: 0.26), so three or four nested shells stay
// readable while rims, holes and shafts (|N.V| -> 0) reach the full tint.
export const XRAY_BASE = 0.1
export const XRAY_POWER = 3
/**
 * Most library colours are near white (aluminium #f5f6f6, ABS #e6dfca), and a white
 * multiplier changes nothing, so the tint's (encoded) luma is capped here, keeping its hue:
 * a white part's silhouette reaches mid grey. 1 disables the cap.
 */
export const XRAY_MAX_LUMA = 0.5

export interface XRayOptions {
  base?: number
  /** Must be > 0 (GLSL pow(0, p) is undefined for p <= 0). */
  power?: number
  maxLuma?: number
}

const vertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  vNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * mvPosition;
}`

// MultiplyBlending with premultipliedAlpha (three r186 WebGLState.setBlending): FUNC_ADD,
// blendFuncSeparate(DST_COLOR, ONE_MINUS_SRC_ALPHA, ZERO, ONE), so
//   rgb = src.rgb * dst + dst * (1 - src.a),  alpha = dst.a.
// With src = (a * t, a): rgb = dst * (1 - a + a * t) = dst * mix(1, t, a). A product commutes,
// so overlapping surfaces give the same pixel in any draw order: no sorting, and both faces
// can draw in one pass (forceSinglePass).
// Colour space: the canvas holds sRGB-encoded values and blending works on those, so the
// multiplier is encoded too: colorspace_fragment encodes the linear tint before the alpha
// premultiply (three's own order). a = 1 over white then gives the exact document colour
// (below the luma cap), and as the sRGB curve is close to a power law, a product of encoded
// values approximates a product of linear ones (a colour filter). Into a linear render
// target the include is a no-op and the product is exact.
const fragmentShader = /* glsl */ `
uniform vec3 uTint;
uniform float uBase;
uniform float uPower;
uniform float uMaxLuma;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
  vec3 viewDir = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
  float facing = clamp(abs(dot(normalize(vNormal), viewDir)), 0.0, 1.0);
  float a = uBase + (1.0 - uBase) * pow(1.0 - facing, uPower);
  gl_FragColor = vec4(uTint, 1.0);
  #include <colorspace_fragment>
  float luma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor.rgb *= min(1.0, uMaxLuma / max(luma, 1e-4));
  gl_FragColor.a = a;
  #include <premultiplied_alpha_fragment>
}`

/**
 * Unlit fresnel X-ray for one document material colour: each surface multiplies what is
 * behind it by mix(1, tint, a), a = base + (1 - base) * (1 - |N.V|)^power, so faces seen
 * head-on stay faint and silhouettes dark. Needs vertex normals (part geometry has them).
 * Uniforms only, so every instance shares one program.
 */
export class XRayMaterial extends ShaderMaterial {
  private readonly tint: Color

  /** `tint` is linear (THREE.Color from the document's sRGB hex); it is copied. */
  constructor(tint: Color, options: XRayOptions = {}) {
    super({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      forceSinglePass: true,
      blending: MultiplyBlending,
      premultipliedAlpha: true,
      toneMapped: false,
    })
    this.name = "XRay"
    this.tint = tint.clone()
    this.uniforms = {
      uTint: { value: this.tint },
      uBase: { value: options.base ?? XRAY_BASE },
      uPower: { value: options.power ?? XRAY_POWER },
      uMaxLuma: { value: options.maxLuma ?? XRAY_MAX_LUMA },
    }
  }

  /** Copies into the uniform (no recompile); the caller keeps its own Color. */
  setTint(color: Color): void {
    this.tint.copy(color)
  }
}
