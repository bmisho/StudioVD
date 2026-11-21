import { describe, expect, it } from "vitest"
import type { BlockDefId, NodeId, SceneDocument } from "@/core/schema"
import { blockDefOf, findModel } from "@/core/sim/models/registry"
import { blockLayout } from "./layout"
import { freeSpot } from "./placement"

describe("free spot for a new block", () => {
  it("centres on the point, then steps clear of blocks already there", () => {
    const model = findModel("electrical.resistor@1")
    if (!model) throw new Error("no resistor")
    const def = blockDefOf(model, "d" as BlockDefId)
    const size = blockLayout(def)
    const doc: Pick<SceneDocument, "schematic"> = {
      schematic: { nodes: {}, edges: {}, blockDefs: { [def.id]: def } },
    }
    const first = freeSpot(doc, size, { x: 0, y: 0 })
    expect(first).toEqual({ x: -size.width / 2, y: -size.height / 2 })
    doc.schematic.nodes["n" as NodeId] = {
      id: "n" as NodeId,
      blockDefId: def.id,
      position: first,
      label: "R1",
      paramValues: {},
    }
    const second = freeSpot(doc, size, { x: 0, y: 0 })
    const clear =
      second.y >= first.y + size.height + 16 ||
      second.y + size.height + 16 <= first.y ||
      second.x >= first.x + size.width + 16 ||
      second.x + size.width + 16 <= first.x
    expect(clear).toBe(true)
    // The nearest clear spot: above or below (the block is wider than tall).
    expect(second.x).toBe(first.x)
  })
})
