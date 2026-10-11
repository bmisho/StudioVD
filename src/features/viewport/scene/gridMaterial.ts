import { Color, FrontSide, ShaderMaterial, Vector2 } from "three"
import type { GridLevel } from "@/core/math/gridLevels"
import type { SceneTokens } from "../theme/sceneTokens"

// CAD ground grid on the XZ plane, written for StudioVD (anti-aliased lines via fwidth).
// The 2x2 plane is placed in the vertex shader around the orbit target's foot, so the grid
// is centred on the model (drei's Grid fades around the camera instead).

const vertexShader = /* glsl */ `
uniform vec2 uCenter;
uniform float uExtent;
varying vec2 vXZ;
void main() {
  // (x, y, 0) -> (x, 0, -y) is a proper rotation, so the front face points up (+Y).
  vec3 p = vec3(position.x * uExtent + uCenter.x, 0.0, -position.y * uExtent + uCenter.y);
  vXZ = p.xz;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`

const fragmentShader = /* glsl */ `
uniform vec2 uCenter;
uniform float uMinor;
uniform float uMinorFade;
uniform float uFade;
uniform vec3 uMinorColor;
uniform vec3 uMajorColor;
uniform vec3 uAxisX;
uniform vec3 uAxisZ;
varying vec2 vXZ;

// Coverage of grid lines w pixels wide; fades where cells get smaller than a pixel.
float lines(vec2 p, float size, float w) {
  vec2 r = p / size;
  vec2 fw = max(fwidth(r), vec2(1e-6));
  vec2 g = abs(fract(r - 0.5) - 0.5) / fw;
  float coverage = 1.0 - min(min(g.x, g.y) + 1.0 - w, 1.0);
  return coverage * (1.0 - smoothstep(0.25, 0.5, max(fw.x, fw.y)));
}

float axisLine(float c, float w) {
  return 1.0 - min(abs(c) / max(fwidth(c), 1e-6) + 1.0 - w, 1.0);
}

void main() {
  float minor = lines(vXZ, uMinor, 1.0) * uMinorFade;
  float major = lines(vXZ, uMinor * 10.0, 1.25);
  float ax = axisLine(vXZ.y, 1.5); // the X axis is the line z = 0
  float az = axisLine(vXZ.x, 1.5); // the Z axis is the line x = 0
  float fade = 1.0 - smoothstep(0.4, 1.0, distance(vXZ, uCenter) / uFade);
  vec3 c = mix(uMinorColor, uMajorColor, step(0.001, major));
  c = mix(c, uAxisX, ax);
  c = mix(c, uAxisZ, az * (1.0 - ax));
  float a = max(max(minor * 0.6, major), max(ax, az)) * fade;
  if (a < 0.004) discard;
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`

export function createGridMaterial(tokens: SceneTokens): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uCenter: { value: new Vector2() },
      uExtent: { value: 1000 },
      uMinor: { value: 10 },
      uMinorFade: { value: 1 },
      uFade: { value: 1000 },
      // THREE.Color converts the sRGB tokens to linear; colorspace_fragment converts back.
      uMinorColor: { value: new Color(tokens.gridMinor) },
      uMajorColor: { value: new Color(tokens.gridMajor) },
      uAxisX: { value: new Color(tokens.axisX) },
      uAxisZ: { value: new Color(tokens.axisZ) },
    },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    // Hidden from below, so bottom views are not hatched by grid lines.
    side: FrontSide,
    // Faces lying exactly on y = 0 win the depth test instead of z-fighting with the grid.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
}

type Uniforms = {
  uCenter: { value: Vector2 }
  uExtent: { value: number }
  uMinor: { value: number }
  uMinorFade: { value: number }
  uFade: { value: number }
}

export function setGridUniforms(
  material: ShaderMaterial,
  level: GridLevel,
  fadeRadius: number,
  centerX: number,
  centerZ: number
): void {
  const u = material.uniforms as unknown as Uniforms // the uniforms created above
  u.uCenter.value.set(centerX, centerZ)
  u.uExtent.value = fadeRadius
  u.uFade.value = fadeRadius
  u.uMinor.value = level.minorMm
  u.uMinorFade.value = level.minorOpacity
}
