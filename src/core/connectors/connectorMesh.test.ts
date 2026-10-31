import { describe, expect, it } from "vitest"
import { buildTopology, isWatertight } from "@/core/geometry/topology"
import { volumeAndCentroid } from "@/core/geometry/massProperties"
import type { Rigid } from "@/core/math/rigid"
import { newId, type AnchorId, type Connector, type ConnectorId } from "@/core/schema"
import { connectorMesh } from "./connectorMesh"

const at = (x: number, y: number, z: number, q: Rigid["q"] = [0, 0, 0, 1]): Rigid => ({
  q,
  t: [x, y, z],
})
const UP: Rigid["q"] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] // z → +Y
const anchor = () => newId<AnchorId>()
const base = { id: newId<ConnectorId>(), name: "C", materialId: null, visible: true }

describe("connectorMesh (derived connector geometry)", () => {
  it("wraps a belt round two pulleys: closed, its volume the pitch length × section", () => {
    const belt: Connector = {
      ...base,
      kind: "belt",
      ends: [
        { anchor: anchor(), radiusMm: 6.366 },
        { anchor: anchor(), radiusMm: 6.366 },
      ],
      widthMm: 6,
      thicknessMm: 1.4,
    }
    const mesh = connectorMesh(belt, [at(0, 10, 0, UP), at(100, 10, 0, UP)])
    if (!mesh) throw new Error("no belt")
    expect(isWatertight(buildTopology({ ...mesh }))).toBe(true)
    const volume = volumeAndCentroid({ ...mesh }).volumeMm3
    const pitch = 200 + 2 * Math.PI * 6.366
    expect(volume / (pitch * 6 * 1.4)).toBeCloseTo(1, 2) // arcs as polygons: within a percent
    for (let i = 1; i < mesh.positions.length; i += 3)
      expect(Math.abs((mesh.positions[i] ?? 0) - 10)).toBeLessThanOrEqual(3 + 1e-6)
  })

  it("runs a tube between two fittings and coils a spring between two anchors", () => {
    const tube: Connector = {
      ...base,
      kind: "tube",
      ends: [anchor(), anchor()],
      outerMm: 4,
      leadMm: 10,
    }
    const t = connectorMesh(tube, [at(0, 0, 0, UP), at(50, 0, 20, UP)])
    const spring: Connector = {
      ...base,
      kind: "spring",
      ends: [anchor(), anchor()],
      outerMm: 10,
      wireMm: 1,
      coils: 8,
    }
    const s = connectorMesh(spring, [at(0, 0, 0), at(0, 40, 0)])
    for (const mesh of [t, s]) {
      if (!mesh) throw new Error("no mesh")
      expect(isWatertight(buildTopology({ ...mesh }))).toBe(true)
      expect(volumeAndCentroid({ ...mesh }).volumeMm3).toBeGreaterThan(0)
    }
    expect(connectorMesh(spring, [at(1, 1, 1), at(1, 1, 1)])).toBeNull()
  })
})
