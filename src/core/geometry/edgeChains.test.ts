import { describe, expect, it } from "vitest"
import type { Vec3 } from "@/core/schema"
import { edgeChains } from "./edgeChains"
import type { FeatureSegments } from "./featureSegments"
import { snapFeatures } from "./snapFeatures"

/** Closed loops of segments (vertex i -> i + 1), each loop between the faces given. */
function loops(...rings: { points: Vec3[]; faces: [number, number][] }[]) {
  const positions: number[] = []
  const ends: number[] = []
  const faces: number[] = []
  for (const { points, faces: sides } of rings) {
    const base = positions.length / 3
    points.forEach((p, i) => {
      positions.push(...p)
      ends.push(base + i, base + ((i + 1) % points.length))
      faces.push(...(sides[i % sides.length] ?? [-1, -1]))
    })
  }
  const seg: FeatureSegments = {
    ends: Uint32Array.from(ends),
    welded: Uint32Array.from(ends),
    faces: Int32Array.from(faces),
    weldedCount: positions.length / 3,
  }
  return { seg, positions: Float32Array.from(positions) }
}

const polygon = (n: number, r: number, z = 0, phase = 0, at: Vec3 = [0, 0, 0]): Vec3[] =>
  Array.from({ length: n }, (_, i) => {
    const a = phase + (2 * Math.PI * i) / n
    return [at[0] + r * Math.cos(a), at[1] + r * Math.sin(a), at[2] + z]
  })

describe("edge chains", () => {
  it("keeps a coarse octagon (45° turns) as one closed chain, splits a square at its corners", () => {
    const { seg, positions } = loops(
      { points: polygon(8, 4), faces: [[0, 1]] },
      { points: polygon(4, 10, 5), faces: [[0, 2]] }
    )
    const { chains, corners } = edgeChains(seg, positions)
    const closed = chains.filter((c) => c.closed)
    expect(closed).toHaveLength(1)
    expect(closed[0]?.vertices).toHaveLength(9) // 8 vertices, the first repeated
    expect(corners).toHaveLength(4)
    expect(chains.filter((c) => !c.closed)).toHaveLength(4)
    for (const c of corners) expect(c.faces).toEqual([0, 2])
  })

  it("keeps a hexagon (60° turns, on the old limit) one chain wherever rounding falls", () => {
    for (const r of [1, 2.5, 4, 7.3, 12])
      for (const phase of [0, 0.1, 0.7, 1.3])
        for (const at of [
          [0, 0, 0],
          [13.7, -2.2, 5],
        ] as Vec3[]) {
          const { seg, positions } = loops({ points: polygon(6, r, 0, phase, at), faces: [[0, 1]] })
          const { chains, corners } = edgeChains(seg, positions)
          expect([chains.length, chains[0]?.closed, corners.length]).toEqual([1, true, 0])
        }
    const pentagon = loops({ points: polygon(5, 4), faces: [[0, 1]] }) // 72°: corners
    expect(edgeChains(pentagon.seg, pentagon.positions).corners).toHaveLength(5)
  })

  it("a loop with one corner is open, ending there both ways, wherever the walk starts", () => {
    // A teardrop: a sharp tip at (0, 10), the rest a smooth arc of radius 4 about the origin.
    const arc = Array.from({ length: 11 }, (_, i): Vec3 => {
      const a = ((60 - 30 * i) * Math.PI) / 180 // 60° down round to -240° (= 120°)
      return [4 * Math.cos(a), 4 * Math.sin(a), 0]
    })
    const tip: Vec3 = [0, 10, 0]
    for (const points of [
      [tip, ...arc],
      [...arc, tip],
    ]) {
      const { seg, positions } = loops({ points, faces: [[0, 1]] })
      const { chains, corners } = edgeChains(seg, positions)
      const t = points.indexOf(tip)
      expect(corners.map((c) => c.vertex)).toEqual([t])
      expect(chains.map((c) => [c.closed, c.vertices[0], c.vertices.at(-1)])).toEqual([
        [false, t, t],
      ])
    }
  })

  it("breaks a rim where the faces beside it change (a hole split into two half cylinders)", () => {
    const rim = polygon(16, 4)
    const sides: [number, number][] = rim.map((_, i) => (i < 8 ? [0, 1] : [0, 2]))
    const { seg, positions } = loops({ points: rim, faces: sides })
    const { chains, corners } = edgeChains(seg, positions)
    expect(corners).toHaveLength(0) // a smooth rim: no vertex snaps on it
    expect(chains.map((c) => [c.closed, c.vertices.length, c.faces])).toEqual(
      expect.arrayContaining([
        [false, 9, [0, 1]],
        [false, 9, [0, 2]],
      ])
    )
  })

  it("feeds circles: the octagon is a closed arc of its radius", () => {
    // Two triangles per side of an octagonal ring between two faces, as a mesh.
    const outer = polygon(8, 4)
    const positions = Float32Array.from([...outer.flat(), 0, 0, 0])
    const indices = Uint32Array.from(outer.flatMap((_, i) => [8, i, (i + 1) % 8]))
    const faces = [{ first: 0, last: 7, kind: "plane" as const }]
    const { edges, corners } = snapFeatures({ positions, indices }, faces)
    expect(corners).toHaveLength(0)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ kind: "arc", closed: true })
    expect(edges[0]?.kind === "arc" && edges[0].radius).toBeCloseTo(4, 5)
  })
})
