import {
  BackSide,
  ShaderMaterial,
  Vector2,
  type BufferGeometry,
  type Camera,
  type Color,
  type Material,
  type Scene,
  type WebGLRenderer,
} from "three"

/** Per-vertex outline direction attribute (computed by core/math/hullNormals.ts). */
export const HULL_NORMAL = "hullNormal"

const vertexShader = /* glsl */ `
attribute vec3 hullNormal;
uniform float thicknessPx;
uniform vec2 bufferSize;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec2 dir = (projectionMatrix * modelViewMatrix * vec4(hullNormal, 0.0)).xy;
  float len = length(dir);
  // Screen-space push: constant pixel width in perspective (w > 1) and ortho (w = 1).
  if (len > 1e-6) clip.xy += dir / len * thicknessPx / bufferSize * clip.w * 2.0;
  gl_Position = clip;
}`

const fragmentShader = /* glsl */ `
uniform vec3 color;
void main() {
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`

/**
 * Inverted-hull outline: the part's own geometry drawn back faces only, pushed out along
 * `hullNormal` by `cssPx` CSS pixels. Shares the part's geometry, so a highlight costs one
 * draw call and no CPU work once the attribute exists.
 */
export class HullOutlineMaterial extends ShaderMaterial {
  private readonly bufferSize = new Vector2(1, 1)
  private readonly thickness = { value: 1 }

  constructor(
    color: Color,
    readonly cssPx: number
  ) {
    super({ vertexShader, fragmentShader, side: BackSide, toneMapped: false })
    this.name = "HullOutline"
    this.thickness.value = cssPx
    this.uniforms = {
      color: { value: color.clone() },
      thicknessPx: this.thickness,
      bufferSize: { value: this.bufferSize },
    }
  }

  /** Width follows the renderer pixel ratio and drawing-buffer size (DPR, resizes). */
  sync(renderer: WebGLRenderer): void {
    renderer.getDrawingBufferSize(this.bufferSize)
    this.thickness.value = this.cssPx * renderer.getPixelRatio()
  }
}

/** `onBeforeRender` for outline meshes. */
export function syncOutlineUniforms(
  renderer: WebGLRenderer,
  _scene: Scene,
  _camera: Camera,
  _geometry: BufferGeometry,
  material: Material
): void {
  if (material instanceof HullOutlineMaterial) material.sync(renderer)
}
