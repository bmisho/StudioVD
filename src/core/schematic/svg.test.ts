import { describe, expect, it } from "vitest"
import {
  createEmptyDocument,
  type BlockDefId,
  type EdgeId,
  type NodeId,
  type SceneDocument,
} from "@/core/schema"
import { blockDefOf, findModel } from "@/core/sim/models/registry"
import { schematicSvg, type SchematicPalette } from "./svg"

/** A schematic built by hand (core tests do not use the store). */
function sample(): SceneDocument {
  const doc = createEmptyDocument("0.1.0")
  const { nodes, blockDefs, edges } = doc.schematic
  let n = 0
  const id = <T extends string>() => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` as T
  const block = (model: string, x: number, y: number, label: string): NodeId => {
    const m = findModel(model)
    if (!m) throw new Error(model)
    const def = blockDefOf(m, id<BlockDefId>())
    blockDefs[def.id] = def
    const node = id<NodeId>()
    nodes[node] = { id: node, blockDefId: def.id, position: { x, y }, label, paramValues: {} }
    return node
  }
  const wire = (source: NodeId, sourcePort: string, target: NodeId, targetPort: string) => {
    const e = id<EdgeId>()
    edges[e] = { id: e, source, sourcePort, target, targetPort }
  }
  const bat = block("electrical.battery@1", 0, 0, "Battery 1")
  const res = block("electrical.resistor@1", 256, 0, `R <load> & "pull"`)
  const k = block("data.constant@1", 0, 160, "Constant 1")
  const probe = block("data.probe@1", 256, 160, "Probe 1")
  wire(bat, "pos", res, "a")
  wire(k, "out", probe, "value")
  return doc
}

const PALETTE: SchematicPalette = {
  background: "#ffffff",
  foreground: "#0f172a",
  muted: "#64748b",
  border: "#cbd5e1",
  domains: {
    electrical: "#ea580c",
    mechTranslational: "#475569",
    mechRotational: "#475569",
    fluid: "#0d9488",
    light: "#a16207",
    data: "#7c3aed",
  },
  font: "Inter, sans-serif",
}

describe("schematic SVG export (PLAN 11.8)", () => {
  it("draws blocks, ports and wires in their domain look, escaping labels", () => {
    const svg = schematicSvg(sample(), PALETTE) ?? ""
    expect(svg.startsWith("<?xml")).toBe(true)
    expect(svg).toContain("R &#60;load&#62; &#38; &#34;pull&#34;")
    expect(svg).not.toContain("<load>")
    expect(svg.match(/<polyline/g)).toHaveLength(2)
    expect(svg).toMatch(
      /<polyline points="[^"]+" fill="none" stroke="#ea580c" stroke-width="1.5" stroke-linejoin/
    )
    expect(svg).toContain('stroke="#7c3aed" stroke-width="1.5" stroke-dasharray="4 3"')
    // Electrical ports are circles; the probe's input is hollow.
    expect(svg).toContain(`<circle`)
    expect(svg).toMatch(/<polygon points="[^"]+" fill="#ffffff" stroke="#7c3aed"/)
    // Well-formed: every element closes (no DOM parser in core; count tags).
    expect(svg.match(/<g>/g)?.length).toBe(svg.match(/<\/g>/g)?.length)
  })

  it("has nothing to export without blocks", () => {
    expect(schematicSvg(createEmptyDocument("0.1.0"), PALETTE)).toBeNull()
  })
})
