import { describe, expect, it } from "vitest"
import type { NodeId } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

const at = { x: 0, y: 0 }

function setup() {
  const store = createDocumentStore()
  const s = () => store.getState()
  const entries = () => store.temporal.getState().pastStates.length
  const add = (model: string): NodeId => {
    const id = s().addBlock(model, at)
    if (!id) throw new Error(`${model} not added`)
    return id
  }
  return { store, s, entries, add }
}

describe("schematic actions (PLAN 11.1-11.4)", () => {
  it("adds a built-in block in one undo entry; blocks of one model share a definition", () => {
    const { s, entries, add } = setup()
    const r1 = add("electrical.resistor@1")
    expect(entries()).toBe(1)
    const r2 = add("electrical.resistor@1")
    const { nodes, blockDefs } = s().doc.schematic
    expect(Object.keys(blockDefs)).toHaveLength(1)
    expect(nodes[r1]?.blockDefId).toBe(nodes[r2]?.blockDefId)
    expect([nodes[r1]?.label, nodes[r2]?.label]).toEqual(["Resistor 1", "Resistor 2"])
    // A board's program is its own: each board gets a definition.
    add("mcu.arduinoUno@1")
    add("mcu.arduinoUno@1")
    expect(Object.keys(s().doc.schematic.blockDefs)).toHaveLength(3)
  })

  it("refuses unknown models and positions a file cannot hold", () => {
    const { s } = setup()
    expect(s().addBlock("electrical.flux@1", at)).toBeNull()
    expect(s().addBlock("electrical.resistor@1", { x: 2e7, y: 0 })).toBeNull()
    expect(s().addBlock("electrical.resistor@1", { x: NaN, y: 0 })).toBeNull()
    expect(s().doc.schematic.blockDefs).toEqual({})
  })

  it("wires by the rules and orders signals from output to input", () => {
    const { s, add } = setup()
    const [bat, res, k, probe, not] = [
      add("electrical.battery@1"),
      add("electrical.resistor@1"),
      add("data.constant@1"),
      add("data.probe@1"),
      add("data.not@1"),
    ]
    const wire = s().connectPorts({ node: bat, port: "pos" }, { node: res, port: "a" })
    expect(typeof wire === "string" && wire.length > 20).toBe(true)
    expect(s().connectPorts({ node: res, port: "a" }, { node: bat, port: "pos" })).toBe("duplicate")
    expect(s().connectPorts({ node: bat, port: "neg" }, { node: probe, port: "value" })).toBe(
      "domain"
    )
    expect(s().connectPorts({ node: res, port: "a" }, { node: res, port: "a" })).toBe("samePort")
    expect(s().connectPorts({ node: res, port: "zz" }, { node: bat, port: "neg" })).toBe("missing")
    // Given input first, stored output → input.
    const sig = s().connectPorts({ node: probe, port: "value" }, { node: k, port: "out" })
    const edge = typeof sig === "string" ? s().doc.schematic.edges[sig as never] : undefined
    expect(edge).toMatchObject({ source: k, sourcePort: "out", target: probe, targetPort: "value" })
    expect(s().connectPorts({ node: not, port: "out" }, { node: probe, port: "value" })).toBe(
      "payload" // a bool into a number input
    )
    const k2 = add("data.constant@1")
    expect(s().connectPorts({ node: k2, port: "out" }, { node: probe, port: "value" })).toBe(
      "driven"
    )
    expect(s().connectPorts({ node: k, port: "out" }, { node: not, port: "out" })).toBe("direction")
  })

  it("deletes blocks with their wires in one undo entry, and undo brings both back", () => {
    const { store, s, entries, add } = setup()
    const [bat, res] = [add("electrical.battery@1"), add("electrical.resistor@1")]
    s().connectPorts({ node: bat, port: "pos" }, { node: res, port: "a" })
    const before = entries()
    s().deleteSchematic([res], [])
    expect(entries()).toBe(before + 1)
    expect(s().doc.schematic.edges).toEqual({})
    expect(Object.keys(s().doc.schematic.nodes)).toEqual([bat])
    store.temporal.getState().undo()
    expect(Object.keys(s().doc.schematic.edges)).toHaveLength(1)
  })

  it("moves, renames and sets parameters within their definitions", () => {
    const { s, entries, add } = setup()
    const res = add("electrical.resistor@1")
    const node = () => s().doc.schematic.nodes[res]
    s().moveNodes(new Map([[res, { x: 40, y: -20 }]]))
    expect(node()?.position).toEqual({ x: 40, y: -20 })
    const before = entries()
    s().moveNodes(new Map([[res, { x: 40, y: -20 }]])) // unchanged: no entry
    s().moveNodes(new Map([[res, { x: 1e9, y: 0 }]])) // out of bounds: ignored
    expect(entries()).toBe(before)
    s().renameNode(res, "  R_load ")
    expect(node()?.label).toBe("R_load")
    s().setNodeParam(res, "resistance", 220)
    s().setNodeParam(res, "resistance", -5) // below its minimum
    s().setNodeParam(res, "resistance", "220") // not a number
    s().setNodeParam(res, "nope", 1)
    expect(node()?.paramValues).toEqual({ resistance: 220 })
    s().setNodeParam(res, "resistance", 1000) // the default: stored as no value
    expect(node()?.paramValues).toEqual({})
    s().setNodeParam(res, "powerRating", 2)
    s().setNodeParam(res, "powerRating", null)
    expect(node()?.paramValues).toEqual({})
  })
})
