import { describe, expect, it } from "vitest"
import { decodePieces, encodeMesh } from "./meshWire"

function pieces(list: number[][]): ArrayBuffer {
  const total = 4 + list.reduce((n, p) => n + 4 + 4 * p.length, 0)
  const view = new DataView(new ArrayBuffer(total))
  view.setUint32(0, list.length, true)
  let at = 4
  for (const p of list) {
    view.setUint32(at, p.length / 3, true)
    at += 4
    for (const v of p) {
      view.setFloat32(at, v, true)
      at += 4
    }
  }
  return view.buffer
}

describe("decomposition wire formats", () => {
  it("writes a mesh with its counts first", () => {
    const bytes = encodeMesh(new Float32Array([0, 1, 2, 3, 4, 5]), new Uint32Array([0, 1, 1]))
    const view = new DataView(bytes.buffer)
    expect([view.getUint32(0, true), view.getUint32(4, true)]).toEqual([2, 1])
    expect(view.getFloat32(8 + 4 * 5, true)).toBe(5)
    expect(view.getUint32(8 + 24 + 8, true)).toBe(1)
    expect(bytes.byteLength).toBe(8 + 24 + 12)
  })

  it("reads pieces and refuses anything malformed", () => {
    const tetra = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]
    const read = decodePieces(pieces([tetra, tetra.map((v) => v + 2)]))
    expect(read?.map((p) => Array.from(p))).toEqual([tetra, tetra.map((v) => v + 2)])
    expect(decodePieces(pieces([]))).toBeNull()
    expect(decodePieces(pieces([[0, 0, 0, 1, 1, 1]]))).toBeNull() // fewer than 4 points
    expect(decodePieces(pieces([tetra]).slice(0, -4))).toBeNull()
    expect(decodePieces(new Uint8Array([...new Uint8Array(pieces([tetra])), 0]).buffer)).toBeNull()
    expect(decodePieces(pieces([[NaN, ...tetra.slice(1)]]))).toBeNull()
  })
})
