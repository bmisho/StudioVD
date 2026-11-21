import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { openSceneBytes, serializeScene, type NodeId, type Port } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

const at = { x: 0, y: 0 }
const dataIn = (key: string): Port => ({
  key,
  name: key,
  domain: "data",
  direction: "in",
  unit: "",
  payload: "number",
})
const dataOut = (key: string): Port => ({
  key,
  name: key,
  domain: "data",
  direction: "out",
  unit: "",
  payload: "number",
})

function setup() {
  const store = createDocumentStore()
  const s = () => store.getState()
  const node = (id: NodeId | null) => {
    if (!id) throw new Error("block not added")
    return id
  }
  /** Saves and opens again (Open runs every integrity rule). */
  const valid = () => {
    const saved = serializeScene(s().doc, "0.1.0")
    if (!saved.ok) throw new Error(JSON.stringify(saved))
    const reopened = openSceneBytes(new TextEncoder().encode(saved.json), "0.1.0")
    expect(reopened.ok ? "ok" : JSON.stringify(reopened)).toBe("ok")
  }
  return { store, s, node, valid }
}

describe("black boxes (PLAN 11.5)", () => {
  it("creates one in one undo entry and edits the definition its blocks share", () => {
    const { store, s, node, valid } = setup()
    const box = node(s().createBlackBox("Controller", at))
    expect(store.temporal.getState().pastStates.length).toBe(1)
    const def = s().doc.schematic.nodes[box]?.blockDefId
    if (!def) throw new Error("no definition")
    const twin = node(s().addBlockOf(def, { x: 100, y: 0 }))
    expect(s().updateBlockDef(def, { ports: [dataIn("vin"), dataOut("out")] })).toBeNull()
    expect(s().updateBlockDef(def, { behaviour: "out = vin > 2.5 ? 1 : 0" })).toBeNull()
    expect(s().doc.schematic.blockDefs[def]?.ports.map((p) => p.key)).toEqual(["vin", "out"])
    // Wire box.out → twin.vin, then drop the port: the wire goes with it.
    expect(typeof s().connectPorts({ node: box, port: "out" }, { node: twin, port: "vin" })).toBe(
      "string"
    )
    expect(s().updateBlockDef(def, { ports: [dataIn("vin")] })).toBeNull()
    expect(s().doc.schematic.edges).toEqual({})
    valid()
  })

  it("refuses invalid definitions and edits to built-in ports", () => {
    const { s, node } = setup()
    const box = node(s().createBlackBox("Box", at))
    const def = s().doc.schematic.nodes[box]?.blockDefId
    const res = node(s().addBlock("electrical.resistor@1", at))
    const builtIn = s().doc.schematic.nodes[res]?.blockDefId
    const uno = node(s().addBlock("mcu.arduinoUno@1", at))
    const board = s().doc.schematic.nodes[uno]?.blockDefId
    if (!def || !builtIn || !board) throw new Error("no definitions")
    expect(s().updateBlockDef(def, { ports: [dataIn("a"), dataIn("a")] })).toMatch(/unique/)
    expect(s().updateBlockDef(def, { behaviour: "x".repeat(4000) })).not.toBeNull()
    expect(s().updateBlockDef(builtIn, { ports: [] })).toMatch(/built-in/)
    expect(s().updateBlockDef(builtIn, { behaviour: "a = 1" })).toMatch(/no program/)
    expect(s().updateBlockDef(board, { behaviour: "d13 = a0 > 512" })).toBeNull()
  })

  it("drops parameter values a changed definition no longer takes", () => {
    const { s, node } = setup()
    const box = node(s().createBlackBox("Box", at))
    const def = s().doc.schematic.nodes[box]?.blockDefId
    if (!def) throw new Error("no definition")
    const gain = {
      key: "gain",
      name: "Gain",
      unit: "",
      kind: "number" as const,
      default: 1,
      max: 10,
    }
    s().updateBlockDef(def, { params: [gain] })
    s().setNodeParam(box, "gain", 8)
    s().updateBlockDef(def, { params: [{ ...gain, max: 5 }] })
    expect(s().doc.schematic.nodes[box]?.paramValues).toEqual({})
  })
})

describe("linking blocks to parts (PLAN 11.6)", () => {
  it("wraps a plain part in a component of its own, and unlinking undoes it", () => {
    const { s, node, valid } = setup()
    const rig = createTestRig()
    s().insertEntities(rig)
    const part = rig.parts[0]?.id
    if (!part) throw new Error("rig incomplete")
    const res = node(s().addBlock("electrical.resistor@1", at))
    expect(s().linkNode(res, part)).toBe(true)
    const instance = s().doc.schematic.nodes[res]?.componentInstanceId
    const c = instance ? s().doc.components[instance] : undefined
    expect(c).toMatchObject({ def: null, designator: "R1", parts: { part }, nodeId: res })
    expect(s().doc.parts[part]?.parentId).toBe(c?.groupId)
    valid()
    // Another block takes the link: the first stays, unlinked; the component is kept.
    const led = node(s().addBlock("electrical.led@1", at))
    expect(s().linkNode(led, part)).toBe(true)
    expect(s().doc.schematic.nodes[res]?.componentInstanceId).toBeUndefined()
    expect(instance && s().doc.components[instance]?.nodeId).toBe(led)
    valid()
    expect(s().linkNode(led, null)).toBe(true)
    expect(s().doc.components).toEqual({})
    expect(s().doc.parts[part]?.componentRef).toBeUndefined()
    valid()
  })

  it("deleting a linked block or part leaves a document Open accepts", () => {
    const { s, node, valid } = setup()
    const rig = createTestRig()
    s().insertEntities(rig)
    const [a, b] = rig.parts.map((p) => p.id)
    if (!a || !b) throw new Error("rig incomplete")
    const r1 = node(s().addBlock("electrical.resistor@1", at))
    const r2 = node(s().addBlock("electrical.resistor@1", at))
    s().linkNode(r1, a)
    s().linkNode(r2, b)
    s().deleteSchematic([r1], [])
    valid()
    s().deleteItems([b], [])
    expect(s().doc.schematic.nodes[r2]?.componentInstanceId).toBeUndefined()
    valid()
  })
})
