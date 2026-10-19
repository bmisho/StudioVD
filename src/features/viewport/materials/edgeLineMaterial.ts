import { ShaderMaterial, type Color } from "three"

/**
 * Default depth pull of feature edges, in view heights: 1e-3 is about one device pixel of
 * depth on a 1000 px tall viewport, at any distance and zoom.
 */
export const EDGE_BIAS_DEFAULT = 1e-3

// polygonOffset only offsets filled polygons, so lines are pulled toward the camera here.
// A constant NDC bias (z -= b * w) does not suit far/near ratios up to 1e4: on a 1000 px
// viewport, b = 2e-5 is 0.02 px of depth at the near plane (concave edges lose against faces
// tilted more than ~2° and dash) but ~190 px at the far plane (edges show through walls).
// So the pull is a fixed share of the pixel footprint at the vertex instead. A line fragment
// lies up to half a pixel off the edge, where a face tilted by θ is 0.5 * tan θ px nearer:
// one pixel wins up to ~63°, and edges show through walls only thinner than about a pixel.
// 2 / P[1][1] is the view height (per unit of depth in perspective, absolute in ortho). In
// clip z the pull is P[3][2] * pull (perspective: the point slid along its eye ray, first
// order) or P[2][2] * pull (ortho), x, y and w untouched; the signs also hold for reversed
// depth. Never past the near plane (zoomed-out ortho views keep only a small margin), and a
// vertex already in front of it stays clipped.
const vertexShader = /* glsl */ `
uniform float uBias;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float pull = uBias * 2.0 / projectionMatrix[1][1];
  float dz = (isOrthographic ? projectionMatrix[2][2] : projectionMatrix[3][2]) * pull;
  #ifdef USE_REVERSED_DEPTH_BUFFER
  gl_Position.z = min(gl_Position.z + dz, max(gl_Position.z, gl_Position.w));
  #else
  gl_Position.z = max(gl_Position.z + dz, min(gl_Position.z, -gl_Position.w));
  #endif
}`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
}`

/**
 * Feature edges (`LineSegments`) for the "shaded + edges" display mode: an unlit line in one
 * colour that wins the depth test against the faces it lies on. All instances share one
 * program; one instance can serve every part.
 */
export class EdgeLineMaterial extends ShaderMaterial {
  /** `color` is linear (THREE.Color from a token); toneMapped=false outputs the token again. */
  constructor(color: Color, bias = EDGE_BIAS_DEFAULT) {
    super({ vertexShader, fragmentShader, toneMapped: false })
    this.name = "EdgeLine"
    this.uniforms = {
      uColor: { value: color.clone() },
      uBias: { value: bias },
    }
  }
}
