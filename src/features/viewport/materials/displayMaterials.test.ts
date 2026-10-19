// @vitest-environment node
import {
  Color,
  DoubleSide,
  FrontSide,
  MultiplyBlending,
  NormalBlending,
  type ShaderMaterial,
} from "three"
import { describe, expect, it } from "vitest"
import { EDGE_BIAS_DEFAULT, EdgeLineMaterial } from "./edgeLineMaterial"
import { XRAY_BASE, XRAY_MAX_LUMA, XRAY_POWER, XRayMaterial } from "./xrayMaterial"

const uniform = (m: ShaderMaterial, name: string): unknown => m.uniforms[name]?.value

/** One program for all instances: same source, no defines, default cache key. */
function expectSharedProgram(a: ShaderMaterial, b: ShaderMaterial): void {
  expect(a.vertexShader).toBe(b.vertexShader)
  expect(a.fragmentShader).toBe(b.fragmentShader)
  expect(a.defines).toEqual({})
  expect(b.defines).toEqual({})
  expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey())
}

describe("edge line material", () => {
  it("is an opaque, depth-tested overlay line in the exact token colour", () => {
    const m = new EdgeLineMaterial(new Color("#334155"))
    expect(m.name).toBe("EdgeLine")
    expect(m.toneMapped).toBe(false)
    expect(m.transparent).toBe(false)
    expect(m.depthTest).toBe(true)
    expect(m.depthWrite).toBe(true)
    expect(m.blending).toBe(NormalBlending)
    expect(m.side).toBe(FrontSide)
  })

  it("copies the colour and defaults the bias", () => {
    const color = new Color("#334155")
    const m = new EdgeLineMaterial(color)
    expect(uniform(m, "uColor")).not.toBe(color)
    expect(uniform(m, "uColor")).toEqual(color)
    color.set("#ff0000")
    expect(uniform(m, "uColor")).toEqual(new Color("#334155"))
    expect(uniform(m, "uBias")).toBe(EDGE_BIAS_DEFAULT)
    expect(uniform(new EdgeLineMaterial(color, 2e-3), "uBias")).toBe(2e-3)
  })

  it("pulls in clip z for both projections and outputs through the colour space", () => {
    const m = new EdgeLineMaterial(new Color())
    expect(m.vertexShader).toContain("isOrthographic")
    expect(m.vertexShader).toContain("projectionMatrix[3][2]")
    expect(m.vertexShader).toContain("projectionMatrix[2][2]")
    expect(m.vertexShader).toContain("#ifdef USE_REVERSED_DEPTH_BUFFER")
    expect(m.fragmentShader).toContain("#include <colorspace_fragment>")
  })

  it("shares one program between instances", () => {
    expectSharedProgram(new EdgeLineMaterial(new Color(1, 0, 0)), new EdgeLineMaterial(new Color()))
  })
})

describe("x-ray material", () => {
  it("multiplies without sorting: no depth write, both faces in one pass, premultiplied", () => {
    const m = new XRayMaterial(new Color("#94a3b8"))
    expect(m.name).toBe("XRay")
    expect(m.transparent).toBe(true)
    expect(m.depthWrite).toBe(false)
    expect(m.depthTest).toBe(true)
    expect(m.side).toBe(DoubleSide)
    expect(m.forceSinglePass).toBe(true)
    // three refuses MultiplyBlending without premultipliedAlpha (WebGLState.setBlending).
    expect(m.blending).toBe(MultiplyBlending)
    expect(m.premultipliedAlpha).toBe(true)
    expect(m.toneMapped).toBe(false)
  })

  it("copies the tint, and setTint copies into the same uniform", () => {
    const tint = new Color("#94a3b8")
    const m = new XRayMaterial(tint)
    const value = uniform(m, "uTint")
    expect(value).not.toBe(tint)
    expect(value).toEqual(tint)
    tint.set("#ff0000")
    expect(value).toEqual(new Color("#94a3b8"))

    const next = new Color("#2f6b3e")
    m.setTint(next)
    expect(uniform(m, "uTint")).toBe(value)
    expect(value).toEqual(next)
    next.set("#ffffff")
    expect(value).toEqual(new Color("#2f6b3e"))
  })

  it("defaults the fresnel terms and takes overrides", () => {
    const m = new XRayMaterial(new Color())
    expect(uniform(m, "uBase")).toBe(XRAY_BASE)
    expect(uniform(m, "uPower")).toBe(XRAY_POWER)
    expect(uniform(m, "uMaxLuma")).toBe(XRAY_MAX_LUMA)
    const o = new XRayMaterial(new Color(), { base: 0.2, power: 2, maxLuma: 1 })
    expect([uniform(o, "uBase"), uniform(o, "uPower"), uniform(o, "uMaxLuma")]).toEqual([0.2, 2, 1])
  })

  it("encodes the tint before the alpha premultiply, with both projections", () => {
    const { vertexShader, fragmentShader } = new XRayMaterial(new Color())
    expect(vertexShader).toContain("normalMatrix * normal")
    expect(fragmentShader).toContain("isOrthographic")
    const encode = fragmentShader.indexOf("#include <colorspace_fragment>")
    const premultiply = fragmentShader.indexOf("#include <premultiplied_alpha_fragment>")
    expect(encode).toBeGreaterThan(-1)
    expect(premultiply).toBeGreaterThan(encode)
  })

  it("shares one program between instances of any tint", () => {
    const a = new XRayMaterial(new Color("#ffffff"))
    const b = new XRayMaterial(new Color("#2a2a2a"), { power: 2 })
    b.setTint(new Color("#d4b483"))
    expectSharedProgram(a, b)
  })
})
