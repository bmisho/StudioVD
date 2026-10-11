// Writes tests/fixtures/bracket.stl: an L-bracket (L profile 40 x 30 mm, 5 mm thick, extruded
// 20 mm along Z) as a closed binary STL, written from scratch for StudioVD's tests (CC0-1.0).
// Expected: 8 faces (6 walls + 2 ends), all planar; volume (40*5 + 25*5) * 20 = 6500 mm³.
import { writeFileSync } from "node:fs"

const L = [[0, 0], [40, 0], [40, 5], [5, 5], [5, 30], [0, 30]] // counter-clockwise
const DEPTH = 20

export function bracketTriangles() {
  const tris = []
  const capTris = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5]] // convex fan from the corner
  for (const [a, b, c] of capTris) {
    tris.push([[...L[a], 0], [...L[c], 0], [...L[b], 0]]) // bottom (z = 0), facing -Z
    tris.push([[...L[a], DEPTH], [...L[b], DEPTH], [...L[c], DEPTH]]) // top, facing +Z
  }
  for (let i = 0; i < L.length; i++) {
    const p = L[i]
    const q = L[(i + 1) % L.length]
    tris.push([[...p, 0], [...q, 0], [...q, DEPTH]])
    tris.push([[...p, 0], [...q, DEPTH], [...p, DEPTH]])
  }
  return tris
}

export function binaryStl(tris) {
  const buf = Buffer.alloc(84 + 50 * tris.length)
  buf.write("StudioVD test fixture: L-bracket (mm)", 0, "ascii") // must not start with "solid"
  buf.writeUInt32LE(tris.length, 80)
  tris.forEach((t, i) => {
    const o = 84 + 50 * i
    const u = [0, 1, 2].map((k) => t[1][k] - t[0][k])
    const v = [0, 1, 2].map((k) => t[2][k] - t[0][k])
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const len = Math.hypot(...n) || 1
    n.forEach((x, k) => buf.writeFloatLE(x / len, o + 4 * k))
    t.flat().forEach((x, k) => buf.writeFloatLE(x, o + 12 + 4 * k))
  })
  return buf
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL("../../tests/fixtures/bracket.stl", import.meta.url), binaryStl(bracketTriangles()))
  console.log("wrote tests/fixtures/bracket.stl")
}
