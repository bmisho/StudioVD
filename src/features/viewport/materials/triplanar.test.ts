import {
  MeshPhysicalMaterial,
  ShaderLib,
  Texture,
  UniformsUtils,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from "three"
import { describe, expect, it, vi } from "vitest"
import { setTriplanarMaps, type TriplanarMaps } from "./triplanar"

const renderer = {} as unknown as WebGLRenderer
const NONE: TriplanarMaps = { baseColor: null, roughness: null }

/** What r186 getProgram hands onBeforeCompile for a physical material: fresh copies. */
function compile(material: MeshPhysicalMaterial, physical = ShaderLib.physical) {
  const shader = {
    shaderName: material.type,
    uniforms: UniformsUtils.clone(physical.uniforms),
    vertexShader: physical.vertexShader,
    fragmentShader: physical.fragmentShader,
    defines: material.defines,
  } as unknown as WebGLProgramParametersWithUniforms
  material.onBeforeCompile(shader, renderer)
  return shader
}

/** The code between `#include <name>` and the next include. */
function after(source: string, include: string): string {
  const anchor = `#include <${include}>`
  const start = source.indexOf(anchor)
  expect(start, anchor).toBeGreaterThanOrEqual(0)
  const rest = source.slice(start + anchor.length)
  return rest.slice(0, rest.indexOf("#include"))
}

const map = (tileSizeMm = 10) => ({ texture: new Texture(), tileSizeMm })
const plainKey = () => new MeshPhysicalMaterial().customProgramCacheKey()

describe("triplanar maps", () => {
  it("leaves a material that never had a map as three made it", () => {
    const material = new MeshPhysicalMaterial()
    setTriplanarMaps(material, NONE)
    expect(material.version).toBe(0)
    expect(Object.hasOwn(material, "onBeforeCompile")).toBe(false)
    expect(material.customProgramCacheKey()).toBe(plainKey())
  })

  it("injects after the r186 physical shader includes", () => {
    const material = new MeshPhysicalMaterial()
    setTriplanarMaps(material, { baseColor: map(), roughness: map() })
    const { vertexShader: vs, fragmentShader: fs } = compile(material)

    expect(after(vs, "common")).toContain("varying vec3 vStvdTriPosition;")
    expect(after(vs, "beginnormal_vertex").trim()).toBe("vStvdTriNormal = objectNormal;")
    expect(after(vs, "begin_vertex").trim()).toBe("vStvdTriPosition = transformed;")

    const pars = after(fs, "map_pars_fragment")
    expect(pars).toContain("uniform sampler2D stvdTriBaseColorMap;")
    expect(pars).toContain("uniform sampler2D stvdTriRoughnessMap;")
    expect(pars).toContain("vec4 stvdTriplanar(")
    expect(fs.indexOf("vec4 stvdTriplanar(")).toBeLessThan(fs.indexOf("void main()"))
    expect(after(fs, "map_fragment")).toMatch(
      /vec3 stvdTriW = stvdTriWeights\(\);\s*#ifdef STVD_TRI_BASECOLOR\s*diffuseColor\.rgb \*= stvdTriplanar\( stvdTriBaseColorMap, stvdTriBaseColorRepeat, stvdTriW \)\.rgb;\s*#endif/
    )
    expect(after(fs, "roughnessmap_fragment")).toMatch(
      /#ifdef STVD_TRI_ROUGHNESS\s*roughnessFactor \*= stvdTriplanar\( stvdTriRoughnessMap, stvdTriRoughnessRepeat, stvdTriW \)\.g;\s*#endif/
    )
    // three's own map paths stay off: no uv attribute to read.
    expect(material.map).toBeNull()
    expect(material.roughnessMap).toBeNull()
  })

  it("keys programs by the set of maps, whatever the textures and the order they came in", () => {
    const base1 = new MeshPhysicalMaterial()
    const base2 = new MeshPhysicalMaterial()
    const rough = new MeshPhysicalMaterial()
    const both = new MeshPhysicalMaterial()
    const bothLater = new MeshPhysicalMaterial()
    setTriplanarMaps(base1, { baseColor: map(5), roughness: null })
    setTriplanarMaps(base2, { baseColor: map(50), roughness: null })
    setTriplanarMaps(rough, { baseColor: null, roughness: map() })
    setTriplanarMaps(both, { baseColor: map(), roughness: map() })
    setTriplanarMaps(bothLater, { baseColor: null, roughness: map() })
    setTriplanarMaps(bothLater, { baseColor: map(), roughness: map() })

    expect(base1.customProgramCacheKey()).toBe(base2.customProgramCacheKey())
    expect(base1.defines).toEqual(base2.defines)
    expect(base1.defines).toHaveProperty("STVD_TRI_BASECOLOR")
    expect(rough.defines).toHaveProperty("STVD_TRI_ROUGHNESS")
    const keys = [base1, rough, both].map((m) => m.customProgramCacheKey())
    expect(new Set([...keys, plainKey()]).size).toBe(4)
    expect(bothLater.customProgramCacheKey()).toBe(both.customProgramCacheKey())
    // three hashes the defines in insertion order (WebGLPrograms.getProgramCacheKey).
    expect(Object.keys(bothLater.defines ?? {})).toEqual(Object.keys(both.defines ?? {}))
  })

  it("goes back to the plain program when the last map is removed", () => {
    const material = new MeshPhysicalMaterial()
    setTriplanarMaps(material, { baseColor: map(), roughness: map() })
    setTriplanarMaps(material, NONE)
    expect(material.customProgramCacheKey()).toBe(plainKey())
    expect(material.defines).toEqual(new MeshPhysicalMaterial().defines)
    const shader = compile(material)
    expect(shader.vertexShader).toBe(ShaderLib.physical.vertexShader)
    expect(shader.fragmentShader).toBe(ShaderLib.physical.fragmentShader)
  })

  it("hands every compile the same uniform objects, maps or not", () => {
    const material = new MeshPhysicalMaterial()
    const base = map(20)
    setTriplanarMaps(material, { baseColor: base, roughness: null })
    const first = compile(material).uniforms
    const second = compile(material).uniforms
    expect(first.stvdTriBaseColorMap?.value).toBe(base.texture)
    expect(first.stvdTriBaseColorRepeat?.value).toBeCloseTo(1 / 20)
    for (const name of [
      "stvdTriBaseColorMap",
      "stvdTriBaseColorRepeat",
      "stvdTriRoughnessMap",
      "stvdTriRoughnessRepeat",
    ]) {
      expect(second[name], name).toBeDefined()
      expect(second[name], name).toBe(first[name])
    }
    // three reuses the last compile's uniforms when it returns to an earlier program.
    setTriplanarMaps(material, NONE)
    expect(compile(material).uniforms.stvdTriBaseColorMap).toBe(first.stvdTriBaseColorMap)
  })

  it("changes textures and tile sizes through uniforms only", () => {
    const material = new MeshPhysicalMaterial()
    setTriplanarMaps(material, { baseColor: map(10), roughness: map(10) })
    const uniforms = compile(material).uniforms
    const version = material.version
    const next = { baseColor: map(25), roughness: map(4) }
    setTriplanarMaps(material, next)
    expect(material.version).toBe(version)
    expect(uniforms.stvdTriBaseColorMap?.value).toBe(next.baseColor.texture)
    expect(uniforms.stvdTriBaseColorRepeat?.value).toBeCloseTo(1 / 25)
    expect(uniforms.stvdTriRoughnessMap?.value).toBe(next.roughness.texture)
    expect(uniforms.stvdTriRoughnessRepeat?.value).toBeCloseTo(1 / 4)
  })

  it("recompiles when a map is added or removed, and only then", () => {
    const material = new MeshPhysicalMaterial()
    const base = map()
    setTriplanarMaps(material, { baseColor: base, roughness: null })
    expect(material.version).toBe(1)
    setTriplanarMaps(material, { baseColor: base, roughness: null })
    expect(material.version).toBe(1)
    setTriplanarMaps(material, { baseColor: base, roughness: map() })
    expect(material.version).toBe(2)
    setTriplanarMaps(material, { baseColor: null, roughness: map() })
    expect(material.version).toBe(3)
    setTriplanarMaps(material, NONE)
    expect(material.version).toBe(4)
    setTriplanarMaps(material, NONE)
    expect(material.version).toBe(4)
  })

  it("draws without maps, and says so, if three's includes have moved", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const material = new MeshPhysicalMaterial()
    setTriplanarMaps(material, { baseColor: map(), roughness: null })
    const moved = {
      ...ShaderLib.physical,
      fragmentShader: ShaderLib.physical.fragmentShader.replace("#include <map_fragment>", ""),
    }
    const shader = compile(material, moved)
    expect(shader.vertexShader).toBe(moved.vertexShader)
    expect(shader.fragmentShader).toBe(moved.fragmentShader)
    expect(warn).toHaveBeenCalledOnce()
  })
})
