import { describe, expect, it } from "vitest"
import { add } from "@/core/math/vec3"
import { GeneratorIdSchema, LocalKeySchema, SemVerSchema } from "@/core/schema"
import { generatorSlug } from "./manifest"
import { prepareGenerated } from "./prepare"
import { GENERATORS, findGenerator } from "./registry"

describe("generator registry", () => {
  it("holds each id and MAJOR once, with valid ids, versions and preset keys", () => {
    const keys = GENERATORS.map((g) => `${g.id}@${g.major}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const g of GENERATORS) {
      expect(GeneratorIdSchema.safeParse(g.id).success, g.id).toBe(true)
      expect(SemVerSchema.safeParse(g.version).success, g.id).toBe(true)
      expect(new Set(g.presets.map((p) => p.key)).size, g.id).toBe(g.presets.length)
      for (const p of g.presets) expect(LocalKeySchema.safeParse(p.key).success, p.key).toBe(true)
      expect(g.params.safeParse(g.defaults).success, g.id).toBe(true)
    }
    expect(findGenerator("bearing.deepGroove", 1)?.name).toBe("Ball bearing")
    expect(findGenerator("bearing.deepGroove", 2)).toBeUndefined()
    expect(findGenerator("toString", 1)).toBeUndefined()
  })

  it("refuses parameters outside a generator's schema", () => {
    const screw = findGenerator("fastener.screw", 1)
    expect(() => screw?.generate({ size: "M7", lengthMm: 10, head: "socket" })).toThrow()
    expect(() => screw?.generate({ size: "M2", lengthMm: 10, head: "button" })).toThrow()
    expect(() => screw?.generate({ size: "M3", lengthMm: 10, head: "socket", extra: 1 })).toThrow()
  })

  it("names components after the generator", () => {
    expect(generatorSlug("bearing.deepGroove")).toBe("bearing-deep-groove")
    expect(generatorSlug("fastener.setScrew")).toBe("fastener-set-screw")
  })
})

describe.each(GENERATORS.map((g) => [g.id, g] as const))("%s manifest", (_, gen) => {
  it("places parts at their assets' offsets and keeps anchors where the generator put them", async () => {
    const { manifest, assets, output } = await prepareGenerated(gen, gen.defaults)
    expect(manifest.identity.requires.generators).toEqual({ [gen.id]: gen.major })
    expect(manifest.authoring).toMatchObject({ kind: "generator", generator: gen.id })
    for (const [key, part] of Object.entries(manifest.parts)) {
      expect(part.transform.positionMm).toEqual(assets[key]?.offsetMm)
      expect(part.geometry).toMatchObject({ kind: "generated", generator: gen.id, output: key })
    }
    for (const [key, anchor] of Object.entries(manifest.anchors)) {
      const at = manifest.parts[anchor.part]?.transform.positionMm ?? [0, 0, 0]
      const expected = output.anchors[key]?.frame.originMm ?? [Number.NaN, 0, 0]
      add(at, anchor.frame.originMm).forEach((v, i) => expect(v).toBeCloseTo(expected[i] ?? 0, 9))
    }
  })

  it("is deterministic: the same parameters give the same assets", async () => {
    const [a, b] = await Promise.all([
      prepareGenerated(gen, gen.defaults),
      prepareGenerated(gen, gen.defaults),
    ])
    expect(Object.values(a.assets).map((x) => x.id)).toEqual(
      Object.values(b.assets).map((x) => x.id)
    )
  })
})

describe("the library fixture's generated bearing", () => {
  it("names parameters and outputs the real generator has", async () => {
    const { libraryFixture } = await import("@/core/schema/testing/libraryFixtures")
    const fixture = libraryFixture("component-generated.valid.json") as {
      parts: Record<
        string,
        {
          geometry: {
            generator: string
            generatorMajor: number
            params: Record<string, unknown>
            output: string
          }
        }
      >
    }
    for (const part of Object.values(fixture.parts)) {
      const gen = findGenerator(part.geometry.generator, part.geometry.generatorMajor)
      expect(gen?.params.safeParse(part.geometry.params).success).toBe(true)
      const bodies = gen?.generate(part.geometry.params as never).bodies ?? {}
      expect(Object.keys(bodies)).toContain(part.geometry.output)
    }
  })
})
