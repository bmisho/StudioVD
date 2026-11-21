import { describe, expect, it } from "vitest"
import { applyPoint, compose, fromFrame, fromPose } from "@/core/math/rigid"
import { mergeBatch, entityBatchProblems } from "@/core/scene/entityBatch"
import { createEmptyDocument, parseDocument } from "@/core/schema"
import { instantiateComponent } from "./instantiate"
import { at, generated } from "./testing/generatedComponent"

describe("instantiateComponent", () => {
  it("places a bearing: parts at pose ∘ transform, anchors and the internal mate by key", async () => {
    const bearing = await generated("bearing.deepGroove", {
      boreMm: 8,
      outerMm: 22,
      widthMm: 7,
      seal: "2RS",
    })
    const doc = createEmptyDocument("0.1.0")
    const pose = {
      positionMm: [10, 20, 30] as [number, number, number],
      quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2] as [number, number, number, number],
    }
    const { batch, instance, designator } = instantiateComponent(doc, { ...bearing, pose })
    expect(entityBatchProblems(doc, batch)).toEqual([])
    const next = mergeBatch(doc, batch)
    expect(parseDocument(JSON.parse(JSON.stringify(next))).ok).toBe(true)
    expect(designator).toBe("BRG1")
    const record = next.components[instance]
    expect(Object.keys(record?.parts ?? {})).toEqual(["outer", "inner"])
    expect(Object.keys(record?.mates ?? {})).toEqual(["spin"])
    expect(next.groups[record?.groupId ?? ("" as never)]?.name).toBe("BRG1 Ball bearing 608-2RS")
    // Two materials: steel for both rings, rubber on the seal slot of the outer ring.
    expect(
      Object.values(next.materials)
        .map((m) => m.builtinKey)
        .sort()
    ).toEqual(["std.rubber", "std.steel"])
    const outer = next.parts[record?.parts.outer ?? ("" as never)]
    expect(outer?.materialSlots).toEqual([{ slot: "Seals", materialId: record?.materials.rubber }])
    // Every anchor lands where the generator put it, carried by the placement pose.
    for (const [key, anchorId] of Object.entries(record?.anchors ?? {})) {
      const anchor = next.anchors[anchorId]
      const part = anchor && next.parts[anchor.partId]
      const def = bearing.def.manifest.anchors[key]
      const partDef = def && bearing.def.manifest.parts[def.part]
      if (!anchor || !part || !def || !partDef) throw new Error("missing")
      const world = applyPoint(compose(fromPose(part.pose), fromFrame(anchor.frame)), [0, 0, 0])
      const expected = applyPoint(
        compose(fromPose(pose), compose(fromPose(partDef.transform), fromFrame(def.frame))),
        [0, 0, 0]
      )
      world.forEach((v, i) => expect(v).toBeCloseTo(expected[i] ?? 0, 9))
      expect(anchor.source).toEqual({ kind: "component", instance, key })
    }
  })

  it("numbers designators on, shares unchanged presets and stores a definition once", async () => {
    const nut = await generated("fastener.nut", { size: "M3" })
    let doc = createEmptyDocument("0.1.0")
    for (const expected of ["H1", "H2"]) {
      const { batch, designator } = instantiateComponent(doc, { ...nut, pose: at(0, 0, 0) })
      expect(designator).toBe(expected)
      doc = mergeBatch(doc, batch)
    }
    expect(Object.keys(doc.materials)).toHaveLength(1)
    expect(Object.keys(doc.componentDefs)).toEqual([nut.def.key])
    expect(Object.keys(doc.assets)).toHaveLength(1)
  })

  it("grounds the root of a first component that asks for it", async () => {
    const box = await generated("primitive.box", { widthMm: 10, heightMm: 10, depthMm: 10 })
    const empty = createEmptyDocument("0.1.0")
    const first = instantiateComponent(empty, { ...box, pose: at(0, 5, 0) })
    expect(first.batch.parts?.[0]?.grounded).toBe(true)
    const second = instantiateComponent(mergeBatch(empty, first.batch), {
      ...box,
      pose: at(20, 5, 0),
    })
    expect(second.batch.parts?.[0]?.grounded).toBe(false)
  })
})

describe("components with a schematic block (PLAN 11.7)", () => {
  it("makes the block on insert, linked both ways, sharing one definition", async () => {
    const nut = await generated("fastener.nut", { size: "M3" })
    const manifest = {
      ...nut.def.manifest,
      schematic: { block: "electromech.dcMotor@1", params: { resistance: 4, kt: -1 } },
    }
    const placed = { ...nut, def: { ...nut.def, manifest }, pose: at(0, 0, 0) }
    let doc = createEmptyDocument("0.1.0")
    const ids: string[] = []
    for (let i = 0; i < 2; i++) {
      const { batch, instance } = instantiateComponent(doc, placed)
      expect(entityBatchProblems(doc, batch)).toEqual([])
      doc = mergeBatch(doc, batch)
      const record = doc.components[instance]
      const node = record?.nodeId ? doc.schematic.nodes[record.nodeId] : undefined
      expect(node?.componentInstanceId).toBe(instance)
      expect(node?.label).toBe(record?.designator)
      // The value outside its bounds is dropped; the other differs from the default.
      expect(node?.paramValues).toEqual({ resistance: 4 })
      ids.push(node?.id ?? "")
    }
    expect(Object.keys(doc.schematic.blockDefs)).toHaveLength(1)
    const [a, b] = ids.map((id) => doc.schematic.nodes[id as never]?.position)
    expect(a).not.toEqual(b) // side by side, not stacked
    expect(parseDocument(JSON.parse(JSON.stringify(doc))).ok).toBe(true)
  })

  it("inserts without a block when the model is not known here", async () => {
    const nut = await generated("fastener.nut", { size: "M3" })
    const manifest = { ...nut.def.manifest, schematic: { block: "electromech.warpDrive@9" } }
    const doc = createEmptyDocument("0.1.0")
    const { batch } = instantiateComponent(doc, {
      ...nut,
      def: { ...nut.def, manifest },
      pose: at(0, 0, 0),
    })
    expect(batch.schematicNodes).toEqual([])
    expect(batch.components?.[0]?.nodeId).toBeUndefined()
  })
})
