import { describe, expect, it } from "vitest"
import { createEmptyDocument, type AssetId } from "@/core/schema"
import { entityBatchProblems } from "@/core/scene/entityBatch"
import { buildImportBatch, cleanName, type ImportedPartInfo } from "./importBatch"

const asset = (n: number, offset: [number, number, number] = [0, 0, 0], slots: string[] = []) => ({
  id: n.toString(16).padStart(64, "0") as AssetId,
  offsetMm: offset,
  triangleCount: 12,
  bboxMm: {
    min: [-1, -1, -1] as [number, number, number],
    max: [1, 1, 1] as [number, number, number],
  },
  watertight: true,
  volumeMm3: 8,
  centroidMm: [0, 0, 0] as [number, number, number],
  faceCount: 6,
  slots,
  slotsFolded: false,
})
const part = (name: string, path: string[], n: number): ImportedPartInfo => ({
  name,
  path,
  asset: asset(n, [n, 0, 0]),
})

describe("buildImportBatch", () => {
  it("a single-part file adds one grounded part at its offset and no group", () => {
    const doc = createEmptyDocument("0.1.0")
    const batch = buildImportBatch(doc, [
      { fileName: "cube.step", parts: [part("Cube", ["Asm"], 1)] },
    ])
    expect(batch.groups).toEqual([])
    expect(batch.parts).toHaveLength(1)
    expect(batch.parts[0]).toMatchObject({ name: "Cube", parentId: null, grounded: true })
    expect(batch.parts[0]?.pose.positionMm).toEqual([1, 0, 0])
    expect(batch.assets[0]?.path).toBe(`geometry/${asset(1).id}.glb`)
    expect(batch.topLevel).toEqual([{ kind: "part", id: batch.parts[0]?.id }])
    expect(entityBatchProblems(doc, batch)).toEqual([])
  })

  it("wraps a multi-part file in a group named after it and mirrors its hierarchy", () => {
    const doc = createEmptyDocument("0.1.0")
    const batch = buildImportBatch(doc, [
      {
        fileName: "robot.glb",
        parts: [part("Base", [], 1), part("Arm", ["Joint"], 2), part("Hand", ["Joint"], 3)],
      },
    ])
    expect(batch.groups.map((g) => g.name)).toEqual(["robot", "Joint"])
    const [robot, joint] = batch.groups
    expect(joint?.parentId).toBe(robot?.id)
    expect(batch.parts.map((p) => [p.name, p.parentId, p.grounded])).toEqual([
      ["Base", robot?.id, true],
      ["Arm", joint?.id, false],
      ["Hand", joint?.id, false],
    ])
    expect(batch.topLevel).toEqual([{ kind: "group", id: robot?.id }])
    expect(entityBatchProblems(doc, batch)).toEqual([])
  })

  it("uses a shared assembly node as the file's group, and grounds nothing in a non-empty doc", () => {
    const doc = createEmptyDocument("0.1.0")
    for (const p of buildImportBatch(doc, [{ fileName: "a.stl", parts: [part("a", [], 9)] }]).parts)
      doc.parts[p.id] = p
    const batch = buildImportBatch(doc, [
      { fileName: "asm.step", parts: [part("A", ["Asm"], 1), part("B", ["Asm"], 2)] },
    ])
    expect(batch.groups.map((g) => g.name)).toEqual(["Asm"])
    expect(batch.parts.every((p) => !p.grounded)).toBe(true)
  })

  it("stores an asset shared by several parts once", () => {
    const shared = { name: "Bolt", path: [], asset: asset(5) }
    const batch = buildImportBatch(createEmptyDocument("0.1.0"), [
      { fileName: "bolts.obj", parts: [shared, { ...shared, name: "Bolt 2" }] },
    ])
    expect(batch.assets).toHaveLength(1)
    expect(batch.parts).toHaveLength(2)
  })

  it("records the slot names of a multi-material asset, and none for a single one", () => {
    const painted = { name: "Knob", path: [], asset: asset(6, [0, 0, 0], ["Cap", "Grip"]) }
    const batch = buildImportBatch(createEmptyDocument("0.1.0"), [
      { fileName: "knob.glb", parts: [painted, part("Plain", [], 7)] },
    ])
    expect(batch.assets.map((a) => a.slots)).toEqual([["Cap", "Grip"], undefined])
    expect(entityBatchProblems(createEmptyDocument("0.1.0"), batch)).toEqual([])
  })

  it("cleans names the schema would reject", () => {
    expect(cleanName("  a \n b ", "x")).toBe("a b")
    expect(cleanName("   ", "Part")).toBe("Part")
    expect(cleanName("n".repeat(300), "x")).toHaveLength(120)
  })
})
