// @vitest-environment node
import { readFileSync } from "node:fs"
import occtInit from "occt-import-js"
import { describe, expect, it } from "vitest"
import { decodeGlb } from "@/core/geometry/glbRead"
import { DEFAULT_IMPORT_OPTIONS, type ImportFormat } from "@/core/import/importOptions"
import { runImport, type ImportJob } from "./runImport"

const fixture = (name: string) => {
  const b = readFileSync(new URL(`../../../tests/fixtures/${name}`, import.meta.url))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}
let occt: ReturnType<typeof occtInit> | undefined
const decoders = { occt: () => (occt ??= occtInit()) }
const job = (
  fileName: string,
  format: ImportFormat,
  bytes: ArrayBuffer,
  extra: Partial<ImportJob> = {}
): ImportJob => ({
  fileName,
  format,
  bytes,
  options: DEFAULT_IMPORT_OPTIONS,
  ...extra,
})

describe("runImport", () => {
  it("STEP cube: one part, 6 planar B-rep faces, 1000 mm³, centred", async () => {
    const { parts, warnings } = await runImport(
      job("cube.step", "step", fixture("cube.step")),
      decoders
    )
    expect(warnings).toEqual([])
    expect(parts).toHaveLength(1)
    const [cube] = parts
    expect(cube?.name).toBe("Cube")
    expect(cube?.asset.faceCount).toBe(6)
    expect(cube?.asset.volumeMm3).toBeCloseTo(1000, 3)
    cube?.asset.offsetMm.forEach((v) => expect(v).toBeCloseTo(0, 6))
    const faces = decodeGlb(cube?.asset.glb ?? new Uint8Array()).faces
    expect(faces.every((f) => f.kind === "plane")).toBe(true)
  }, 30_000)

  it("STL bracket: 8 planar faces, closed, 6500 mm³, placed where it was", async () => {
    const { parts } = await runImport(job("bracket.stl", "stl", fixture("bracket.stl")), decoders)
    const [bracket] = parts
    expect(bracket?.name).toBe("bracket")
    expect(bracket?.asset.faceCount).toBe(8)
    expect(bracket?.asset.watertight).toBe(true)
    expect(bracket?.asset.volumeMm3).toBeCloseTo(6500, 2)
    expect(bracket?.asset.offsetMm).toEqual([20, 15, 10])
  })

  it("STL in inches with Z up converts units and axes", async () => {
    const options = { ...DEFAULT_IMPORT_OPTIONS, unit: "in" as const, upAxis: "z" as const }
    const { parts } = await runImport(
      job("bracket.stl", "stl", fixture("bracket.stl"), { options }),
      decoders
    )
    // centre (20, 15, 10) in -> (x, z, -y) * 25.4
    bracketOffset(parts[0]?.asset.offsetMm).forEach((v, i) =>
      expect(v).toBeCloseTo([508, 254, -381][i] ?? NaN, 3)
    )
    expect(parts[0]?.asset.volumeMm3).toBeCloseTo(6500 * 25.4 ** 3, -1)
  })

  it("GLB: metres to mm, node transforms baked, hierarchy and colours kept", async () => {
    const { parts } = await runImport(job("sample.glb", "glb", fixture("sample.glb")), decoders)
    expect(parts.map((p) => [p.name, p.path.join("/")])).toEqual([
      ["Plate", "Assembly"],
      ["Peg", "Assembly"],
    ])
    const [plate, peg] = parts
    // Assembly: +100 mm on X and 90° about Y, so the 50 x 10 x 40 plate becomes 40 x 10 x 50.
    expect(plate?.asset.offsetMm.map((v) => Math.round(v))).toEqual([100, 0, 0])
    expect(plate?.asset.bboxMm.max.map((v) => Math.round(v))).toEqual([20, 5, 25])
    expect(peg?.asset.offsetMm.map((v) => Math.round(v))).toEqual([100, 20, 0])
    expect(decodeGlb(plate?.asset.glb ?? new Uint8Array()).baseColor?.[2]).toBeCloseTo(0.8, 5)
  })

  it("OBJ with MTL: one part per object, Kd colour linearized; single split merges", async () => {
    const obj =
      "mtllib a.mtl\no A\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl red\nf 1 2 3\no B\nv 0 0 1\nv 1 0 1\nv 0 1 1\nf 4 5 6\n"
    const bytes = new TextEncoder().encode(obj).slice().buffer
    const mtlText = "newmtl red\nKd 1 0.5 0\n"
    const { parts } = await runImport(job("pair.obj", "obj", bytes, { mtlText }), decoders)
    expect(parts.map((p) => p.name)).toEqual(["A", "B"])
    expect(decodeGlb(parts[0]?.asset.glb ?? new Uint8Array()).baseColor?.[1]).toBeCloseTo(0.214, 3)
    const single = await runImport(
      job("pair.obj", "obj", bytes, {
        mtlText,
        options: { ...DEFAULT_IMPORT_OPTIONS, split: "single" },
      }),
      decoders
    )
    expect(single.parts.map((p) => [p.name, p.asset.triangleCount])).toEqual([["pair", 2]])
  })

  it("reports a broken file instead of crashing", async () => {
    await expect(
      runImport(job("bad.glb", "glb", new Uint8Array([1, 2, 3, 4]).buffer), decoders)
    ).rejects.toThrow()
  })
})

const bracketOffset = (v: number[] | undefined) => v ?? [NaN, NaN, NaN]
