import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { SelectionRef } from "@/core/scene/selection"
import { openSceneBytes, SCENE_LIMITS, serializeScene, type GroupId } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

type Store = ReturnType<typeof createDocumentStore>
const group = (store: Store, items: SelectionRef[], name: string): GroupId => {
  const id = store.getState().groupItems(items, name)
  if (!id) throw new Error(`${name} was not created`)
  return id
}

/**
 * scene.json is the contract (PLAN 5.1): after every store action the document must save,
 * and what is saved must open again as the same document.
 */
describe("document store contract", () => {
  it("every action leaves a document that saves and reopens unchanged", () => {
    const store = createDocumentStore()
    const s = () => store.getState()
    const roundTrips = (step: string) => {
      const saved = serializeScene(s().doc, "0.1.0")
      expect(saved.ok, step).toBe(true)
      if (!saved.ok) return
      const reopened = openSceneBytes(new TextEncoder().encode(saved.json), "0.1.0")
      expect(reopened.ok && reopened.document, step).toEqual({ ...s().doc, appVersion: "0.1.0" })
    }

    const rig = createTestRig()
    s().insertEntities(rig)
    roundTrips("insert rig")
    const [base, leaf] = rig.parts.map((p) => p.id)
    if (!base || !leaf) throw new Error("rig incomplete")
    const outer = s().createGroup("Outer")
    const inner = group(store, [{ kind: "part", id: leaf }], "Inner")
    group(store, [{ kind: "group", id: inner }], "Middle")
    roundTrips("groups")
    s().renameGroup(outer, "Frame")
    s().renamePart(base, "Base plate")
    s().setPartsVisible([leaf], false)
    s().setPartsGrounded([leaf], true)
    s().setPartPose(leaf, { positionMm: [1, 2, 3], quaternion: [0, 0, 0.6, 0.8] })
    roundTrips("edits")
    const frame = { originMm: [0, 40, 30] as const, z: [0, 0, 1] as const, x: [1, 0, 0] as const }
    const anchor = s().addAnchor({
      partId: base,
      kind: "planar",
      frame: { originMm: [...frame.originMm], z: [...frame.z], x: [...frame.x] },
      source: { kind: "face", faceIndex: 2 },
      name: "Front",
    })
    if (!anchor) throw new Error("anchor not added")
    s().updateAnchor(anchor, { name: "Front face", interface: "M3-hole", kind: "axial" })
    s().flipAnchor(anchor)
    roundTrips("anchors")
    s().setPartsGrounded([leaf], false)
    const onLeaf = s().addAnchor({
      partId: leaf,
      kind: "axial",
      frame: { originMm: [3, -4, 5], z: [0, 1, 0], x: [1, 0, 0] },
      source: { kind: "manual" },
    })
    if (!onLeaf) throw new Error("anchor not added")
    const added = s().addMate({
      anchorA: anchor,
      anchorB: onLeaf,
      type: "revolute",
      flip: true,
      angleOffsetRad: -Math.PI / 2,
    })
    if (!added.ok) throw new Error(`mate not added: ${added.reason}`)
    roundTrips("mate (leaf snapped onto the base)")
    s().updateMate(added.id, { flip: false, angleOffsetRad: -0, limits: { min: -1, max: 1 } })
    s().updateMate(added.id, { type: "fixed", contactsEnabled: true, suppressed: true })
    s().updateMate(added.id, { suppressed: false, limits: null })
    s().setPartPose(leaf, { positionMm: [9, 9, 9], quaternion: [0, 0.6, 0, 0.8] })
    s().resnapMate(added.id)
    roundTrips("mate edits")
    // A coupling: the rig's own hinge driving this mate as a gear (both revolute again).
    s().updateMate(added.id, { type: "revolute" })
    const hinge = rig.mates[0]?.id
    if (!hinge) throw new Error("rig incomplete")
    const coupling = s().addCoupling("gear", hinge, added.id, -2)
    if (!coupling) throw new Error("coupling not added")
    s().setCouplingRatio(coupling, -0.5)
    s().setPartsCollider([leaf], "decomposed")
    s().setPartPoses(new Map([[leaf, { positionMm: [4, 5, 6], quaternion: [0, 0, 0, 1] }]]))
    roundTrips("coupling, collider, poses")
    s().deleteMates([added.id])
    expect(s().doc.couplings).toEqual({}) // went with its mate
    roundTrips("delete mate")
    s().deleteAnchors([rig.anchors[0]?.id ?? anchor])
    roundTrips("delete anchor with its mate")
    s().deleteGroups([inner])
    roundTrips("delete group")
    s().deleteItems([base], [outer])
    roundTrips("delete mixed")
    store.temporal.getState().undo()
    store.temporal.getState().undo()
    roundTrips("undo")
    const second = createTestRig()
    s().insertEntities(second) // a second rig shares the content-addressed assets
    roundTrips("second rig")

    // The schematic (Phase 11): blocks, wires, parameters, a black box, a block on a part.
    const bat = s().addBlock("electrical.battery@1", { x: 0, y: 0 })
    const res = s().addBlock("electrical.resistor@1", { x: 120, y: 0 })
    const uno = s().addBlock("mcu.arduinoUno@1", { x: 0, y: 200 })
    const box = s().createBlackBox("Sensor board", { x: 240, y: 0 })
    if (!bat || !res || !uno || !box) throw new Error("blocks not added")
    s().connectPorts({ node: bat, port: "pos" }, { node: res, port: "a" })
    s().moveNodes(new Map([[res, { x: 121.5, y: -3 }]]))
    s().renameNode(res, "R_load")
    s().setNodeParam(res, "resistance", 220)
    roundTrips("blocks and a wire")
    const boxDef = s().doc.schematic.nodes[box]?.blockDefId
    const board = s().doc.schematic.nodes[uno]?.blockDefId
    if (!boxDef || !board) throw new Error("no definitions")
    s().updateBlockDef(boxDef, {
      ports: [
        { key: "vin", name: "Vin", domain: "electrical", direction: "terminal", unit: "V" },
        { key: "out", name: "Out", domain: "data", direction: "out", unit: "", payload: "bool" },
      ],
      params: [{ key: "level", name: "Level", unit: "V", kind: "number", default: 2.5 }],
      behaviour: "out = vin > level",
    })
    s().updateBlockDef(board, { behaviour: "d13 = a0 > 512" })
    s().connectPorts({ node: box, port: "vin" }, { node: res, port: "b" })
    roundTrips("black box")
    const linked = second.parts[0]?.id
    if (!linked) throw new Error("rig incomplete")
    s().linkNode(res, linked)
    roundTrips("block linked to a part")
    s().deleteSchematic([bat], [])
    s().updateBlockDef(boxDef, { ports: [] })
    roundTrips("schematic deletions")
    s().deleteItems([linked], [])
    roundTrips("linked part deleted")
    s().setGravity([0, -1.62, 0]) // the Moon
    s().setGravity([NaN, 0, 0]) // ignored
    expect(s().doc.simulation.gravity).toEqual([0, -1.62, 0])
    roundTrips("gravity")
  })

  it("New Group stops at the deepest nesting a file may hold", () => {
    const store = createDocumentStore()
    const rig = createTestRig()
    store.getState().insertEntities(rig)
    const leaf = rig.parts[0]?.id
    if (!leaf) throw new Error("rig incomplete")
    let top = group(store, [{ kind: "part", id: leaf }], "G")
    let depth = 1
    for (; depth < 100; depth++) {
      const next = store.getState().groupItems([{ kind: "group", id: top }], "G") // Ctrl+G
      if (!next) break
      top = next
    }
    expect(depth).toBe(SCENE_LIMITS.maxGroupDepth)
    const before = store.getState().doc
    expect(store.getState().groupItems([{ kind: "part", id: leaf }], "Below")).toBeNull()
    expect(store.getState().doc).toBe(before)
    const deepest = store.getState().doc.parts[leaf]?.parentId ?? null
    expect(() => store.getState().createGroup("Below", deepest)).toThrow()
    expect(serializeScene(store.getState().doc, "0.1.0").ok).toBe(true)
  })
})
