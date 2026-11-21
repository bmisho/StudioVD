import { describe, expect, it } from "vitest"
import {
  createEmptyDocument,
  newId,
  type BlockDefId,
  type EdgeId,
  type NodeId,
  type SceneDocument,
} from "@/core/schema"
import { connectionProblem, orderSignal } from "./connections"
import { blockDefOf, findModel } from "./models/registry"

/** A document holding one node of each named model. */
function schematic(models: string[]) {
  const doc: SceneDocument = createEmptyDocument("0.1.0")
  const ids = models.map((key) => {
    const model = findModel(key)
    if (!model) throw new Error(key)
    const def = blockDefOf(model, newId<BlockDefId>())
    doc.schematic.blockDefs[def.id] = def
    const id = newId<NodeId>()
    doc.schematic.nodes[id] = {
      id,
      blockDefId: def.id,
      position: { x: 0, y: 0 },
      label: model.name,
      paramValues: {},
    }
    return id
  })
  const wire = (a: [NodeId, string], b: [NodeId, string]) => {
    const id = newId<EdgeId>()
    doc.schematic.edges[id] = { id, source: a[0], sourcePort: a[1], target: b[0], targetPort: b[1] }
  }
  return { doc, ids, wire }
}

describe("wiring rules (PLAN 11.4)", () => {
  it("joins terminals of one domain, any number of times per net", () => {
    const {
      doc,
      ids: [battery, resistor, led] = [],
      wire,
    } = schematic(["electrical.battery@1", "electrical.resistor@1", "electrical.led@1"])
    if (!battery || !resistor || !led) throw new Error("nodes")
    expect(
      connectionProblem(doc, { node: battery, port: "pos" }, { node: resistor, port: "a" })
    ).toBeNull()
    wire([battery, "pos"], [resistor, "a"])
    expect(
      connectionProblem(doc, { node: battery, port: "pos" }, { node: led, port: "anode" })
    ).toBeNull()
    expect(
      connectionProblem(doc, { node: resistor, port: "a" }, { node: battery, port: "pos" })
    ).toBe("duplicate")
    expect(
      connectionProblem(doc, { node: battery, port: "pos" }, { node: battery, port: "pos" })
    ).toBe("samePort")
  })

  it("refuses other domains and other fluid media", () => {
    const { doc, ids: [battery, pump, fan, led, sensor] = [] } = schematic([
      "electrical.battery@1",
      "electromech.pump@1",
      "electromech.fan@1",
      "electrical.led@1",
      "light.sensor@1",
    ])
    if (!battery || !pump || !fan || !led || !sensor) throw new Error("nodes")
    expect(
      connectionProblem(doc, { node: battery, port: "pos" }, { node: pump, port: "inlet" })
    ).toBe("domain")
    expect(
      connectionProblem(doc, { node: pump, port: "outlet" }, { node: fan, port: "inlet" })
    ).toBe("medium")
    expect(
      connectionProblem(doc, { node: led, port: "light" }, { node: sensor, port: "light" })
    ).toBeNull()
  })

  it("sends signals from an output to one input of a fitting kind", () => {
    const {
      doc,
      ids: [k1, k2, gate, probe, servo] = [],
      wire,
    } = schematic([
      "data.constant@1",
      "data.constant@1",
      "data.logic@1",
      "data.probe@1",
      "electromech.servo@1",
    ])
    if (!k1 || !k2 || !gate || !probe || !servo) throw new Error("nodes")
    // Order does not matter for the check; the file keeps output → input.
    expect(orderSignal(doc, { node: probe, port: "value" }, { node: k1, port: "out" })).toEqual({
      source: { node: k1, port: "out" },
      target: { node: probe, port: "value" },
    })
    expect(connectionProblem(doc, { node: k1, port: "out" }, { node: k2, port: "out" })).toBe(
      "direction"
    )
    expect(connectionProblem(doc, { node: k1, port: "out" }, { node: gate, port: "a" })).toBe(
      "payload"
    ) // number into bool
    expect(
      connectionProblem(doc, { node: gate, port: "out" }, { node: servo, port: "command" })
    ).toBe("payload")
    wire([k1, "out"], [probe, "value"])
    expect(connectionProblem(doc, { node: k2, port: "out" }, { node: probe, port: "value" })).toBe(
      "driven"
    )
  })

  it("reports ports that are gone", () => {
    const { doc, ids: [k1] = [] } = schematic(["data.constant@1"])
    if (!k1) throw new Error("nodes")
    expect(
      connectionProblem(doc, { node: k1, port: "out" }, { node: newId<NodeId>(), port: "x" })
    ).toBe("missing")
  })
})
