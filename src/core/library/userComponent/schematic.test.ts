import { describe, expect, it } from "vitest"
import { mergeBatch } from "@/core/scene/entityBatch"
import { createEmptyDocument, type SceneDocument } from "@/core/schema"
import { instantiateComponent } from "../instantiate"
import { at, generated } from "../testing/generatedComponent"
import { savedSchematic } from "./schematic"

async function withBlock(block: string, params?: Record<string, number>) {
  const nut = await generated("fastener.nut", { size: "M3" })
  const manifest = { ...nut.def.manifest, schematic: { block, ...(params && { params }) } }
  const doc = createEmptyDocument("0.1.0")
  const { batch } = instantiateComponent(doc, {
    ...nut,
    def: { ...nut.def, manifest },
    pose: at(0, 0, 0),
  })
  return mergeBatch(doc, batch)
}

const parts = (doc: SceneDocument) => Object.values(doc.parts)

describe("Save as component carries its block (PLAN 11.7)", () => {
  it("the linked built-in block with the values set on it", async () => {
    const doc = await withBlock("electrical.resistor@1", { resistance: 220 })
    expect(savedSchematic(doc, parts(doc))).toEqual({
      schematic: { block: "electrical.resistor@1", params: { resistance: 220 } },
    })
  })

  it("nothing for a board (its program stays in the project) or unlinked parts", async () => {
    const board = await withBlock("mcu.arduinoUno@1")
    expect(savedSchematic(board, parts(board))).toEqual({})
    const plain = createEmptyDocument("0.1.0")
    expect(savedSchematic(plain, [])).toEqual({})
  })
})
