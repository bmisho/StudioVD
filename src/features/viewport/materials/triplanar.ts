import {
  Material,
  type IUniform,
  type MeshPhysicalMaterial,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three"

/** One map projected along the part's three local axes; one image repeat covers `tileSizeMm`. */
export interface TriplanarMap {
  texture: Texture
  tileSizeMm: number
}

/** The maps a material draws (PLAN 6.3); `null` leaves that slot unmapped. */
export interface TriplanarMaps {
  baseColor: TriplanarMap | null
  roughness: TriplanarMap | null
}

type Slot = keyof TriplanarMaps
/** Fixed order: the defines are rebuilt in it, so equal sets give equal program keys. */
const SLOTS = ["baseColor", "roughness"] as const satisfies readonly Slot[]
const DEFINES: Record<Slot, string> = {
  baseColor: "STVD_TRI_BASECOLOR",
  roughness: "STVD_TRI_ROUGHNESS",
}

interface SlotUniforms {
  map: IUniform<Texture | null>
  /** Image repeats per millimetre (1 / tile size): a multiply in the shader, not a divide. */
  repeat: IUniform<number>
}

/**
 * Per material, outside `userData`: the glTF export serialises userData into extras, and
 * these hold textures. Present once the material has had a map.
 */
const installed = new WeakMap<MeshPhysicalMaterial, Record<Slot, SlotUniforms>>()

/** What three keys a material without `onBeforeCompile` by (Material.customProgramCacheKey). */
const PLAIN_KEY = Material.prototype.onBeforeCompile.toString()

// Part-local (object space) position and normal: parts are recentred at import, so the
// pattern follows the part's pose. `transformed` and `objectNormal` are the attributes before
// morphs and skinning (r186 begin_vertex, beginnormal_vertex); instance and batch matrices
// apply later, in project_vertex.
const VERTEX_PARS = /* glsl */ `
varying vec3 vStvdTriPosition;
varying vec3 vStvdTriNormal;`

// Weights |n|^4, normalised: a face 20° off an axis takes 98% of that axis's projection, one
// at 45° half and half. Each plane's image runs right and up as seen from outside the face
// (up is +Y on the sides; the front, +Z, edge at the bottom of the top face), so text and
// grain are not mirrored on the negative faces. No branches around the samples: implicit
// derivatives (mipmap selection) need uniform control flow.
const FRAGMENT_PARS = /* glsl */ `
varying vec3 vStvdTriPosition;
varying vec3 vStvdTriNormal;
#ifdef STVD_TRI_BASECOLOR
uniform sampler2D stvdTriBaseColorMap;
uniform float stvdTriBaseColorRepeat;
#endif
#ifdef STVD_TRI_ROUGHNESS
uniform sampler2D stvdTriRoughnessMap;
uniform float stvdTriRoughnessRepeat;
#endif
vec3 stvdTriWeights() {
  vec3 w = vStvdTriNormal * vStvdTriNormal;
  w *= w;
  return w / max( w.x + w.y + w.z, 1e-6 );
}
vec4 stvdTriplanar( sampler2D tex, float repeatPerMm, vec3 w ) {
  vec3 p = vStvdTriPosition * repeatPerMm;
  vec3 s = step( 0.0, vStvdTriNormal ) * 2.0 - 1.0;
  return texture2D( tex, vec2( - p.z * s.x, p.y ) ) * w.x
    + texture2D( tex, vec2( p.x, - p.z * s.y ) ) * w.y
    + texture2D( tex, vec2( p.x * s.z, p.y ) ) * w.z;
}`

// Colour maps are SRGBColorSpace textures: three uploads them as SRGB8_ALPHA8 (r186
// WebGLTextures getInternalFormat), so the GPU decodes to linear on sampling, as for `map`.
// Alpha is not used: opacity stays the material's.
const BASE_COLOR = /* glsl */ `
vec3 stvdTriW = stvdTriWeights();
#ifdef STVD_TRI_BASECOLOR
  diffuseColor.rgb *= stvdTriplanar( stvdTriBaseColorMap, stvdTriBaseColorRepeat, stvdTriW ).rgb;
#endif`

// The G channel, like three's roughnessMap (glTF metallic-roughness packing).
const ROUGHNESS = /* glsl */ `
#ifdef STVD_TRI_ROUGHNESS
  roughnessFactor *= stvdTriplanar( stvdTriRoughnessMap, stvdTriRoughnessRepeat, stvdTriW ).g;
#endif`

type Injection = readonly [include: string, code: string]
const VERTEX: readonly Injection[] = [
  ["common", VERTEX_PARS],
  ["beginnormal_vertex", "vStvdTriNormal = objectNormal;"],
  ["begin_vertex", "vStvdTriPosition = transformed;"],
]
const FRAGMENT: readonly Injection[] = [
  ["map_pars_fragment", FRAGMENT_PARS],
  ["map_fragment", BASE_COLOR],
  ["roughnessmap_fragment", ROUGHNESS],
]

/** Inserts each snippet after its `#include`; `null` if three no longer has one of them. */
function inject(source: string, injections: readonly Injection[]): string | null {
  let out = source
  for (const [include, code] of injections) {
    const anchor = `#include <${include}>`
    if (!out.includes(anchor)) return null
    out = out.replace(anchor, () => `${anchor}\n${code}`)
  }
  return out
}

const activeSlots = (material: MeshPhysicalMaterial): Slot[] =>
  SLOTS.filter(
    (slot) => material.defines !== undefined && Object.hasOwn(material.defines, DEFINES[slot])
  )

function install(material: MeshPhysicalMaterial): Record<Slot, SlotUniforms> {
  const uniforms: Record<Slot, SlotUniforms> = {
    baseColor: { map: { value: null }, repeat: { value: 1 } },
    roughness: { map: { value: null }, repeat: { value: 1 } },
  }
  installed.set(material, uniforms)
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    // Always, and the same objects: three keeps the uniforms of the last compile when it
    // switches back to a program this material already had (r186 WebGLRenderer.getProgram).
    shader.uniforms.stvdTriBaseColorMap = uniforms.baseColor.map
    shader.uniforms.stvdTriBaseColorRepeat = uniforms.baseColor.repeat
    shader.uniforms.stvdTriRoughnessMap = uniforms.roughness.map
    shader.uniforms.stvdTriRoughnessRepeat = uniforms.roughness.repeat
    if (activeSlots(material).length === 0) return // the plain program, under the plain key
    const vertex = inject(shader.vertexShader, VERTEX)
    const fragment = inject(shader.fragmentShader, FRAGMENT)
    if (vertex === null || fragment === null) {
      console.warn("Triplanar maps: a three.js shader include moved; drawing without maps.")
      return
    }
    shader.vertexShader = vertex
    shader.fragmentShader = fragment
  }
  // The program depends only on which maps are present (textures and tile sizes are
  // uniforms), so every material with the same set shares one; none shares the plain one.
  material.customProgramCacheKey = () => {
    const active = activeSlots(material)
    return active.length === 0 ? PLAIN_KEY : `stvd-triplanar-1:${active.join("+")}`
  }
  return uniforms
}

/**
 * Draws `maps` on `material` without UVs (PLAN 6.3): each is projected triplanar in part-local
 * millimetres, through our own defines and uniforms, not `map`/`roughnessMap` (those switch on
 * three's uv paths, and assets have no uv attribute). A new texture or tile size only sets a
 * uniform; adding or removing a map recompiles (`needsUpdate`), and only then.
 */
export function setTriplanarMaps(material: MeshPhysicalMaterial, maps: TriplanarMaps): void {
  let uniforms = installed.get(material)
  if (!uniforms) {
    if (maps.baseColor === null && maps.roughness === null) return // nothing to draw yet
    uniforms = install(material)
  }
  for (const slot of SLOTS) {
    const map = maps[slot]
    uniforms[slot].map.value = map?.texture ?? null
    if (map) uniforms[slot].repeat.value = 1 / map.tileSizeMm
  }
  const wanted = SLOTS.filter((slot) => maps[slot] !== null)
  if (wanted.join() === activeSlots(material).join()) return
  const defines = (material.defines ??= {})
  for (const slot of SLOTS) delete defines[DEFINES[slot]]
  for (const slot of wanted) defines[DEFINES[slot]] = ""
  material.needsUpdate = true
}
