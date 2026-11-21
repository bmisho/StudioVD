import { describe, expect, it } from "vitest"
import { entityBatchProblems, mergeBatch } from "@/core/scene/entityBatch"
import { ComponentManifestSchema, createEmptyDocument } from "@/core/schema"
import { instantiateComponent } from "./instantiate"
import { openSlots } from "./instantiateBindings"
import { at, generated } from "./testing/generatedComponent"

// A component's own bindings (PLAN 13.2): made on insert by its keys; a slot waits.

async function switchComponent() {
  const nut = await generated("fastener.nut", { size: "M3" })
  const part = Object.keys(nut.def.manifest.parts)[0] ?? ""
  const manifest = ComponentManifestSchema.parse({
    ...nut.def.manifest,
    schematic: { block: "electrical.switch@1" },
    bindings: [
      // Pressed by a part the user names: the switch opens.
      {
        key: "actuator",
        from: { kind: "contactSlot", a: part, slot: "Actuator" },
        to: { kind: "param", param: "closed" },
        scale: -1,
        offset: 1,
      },
      // Its own mass shown nowhere useful, but a binding made at once.
      {
        key: "glow",
        from: { kind: "output", port: "a", quantity: "flow" },
        to: { kind: "tint", part },
        scale: 1,
        offset: 0,
      },
      // A template naming a parameter the block lacks is left out.
      {
        key: "bad",
        from: { kind: "mass", part },
        to: { kind: "param", param: "nope" },
        scale: 1,
        offset: 0,
      },
    ],
  })
  return { ...nut, def: { ...nut.def, manifest }, pose: at(0, 0, 0) }
}

describe("component bindings", () => {
  it("are made on insert by key, slots excepted, and the document stays valid", async () => {
    const placed = await switchComponent()
    const doc = createEmptyDocument("0.1.0")
    const { batch, instance } = instantiateComponent(doc, placed)
    expect(entityBatchProblems(doc, batch)).toEqual([])
    const next = mergeBatch(doc, batch)
    const record = next.components[instance]
    expect(Object.keys(record?.bindings ?? {})).toEqual(["glow"])
    const b = next.bindings[record?.bindings.glow ?? ("" as never)]
    expect(b?.from).toMatchObject({ kind: "output", node: record?.nodeId, port: "a" })
    expect(openSlots(placed.def.manifest, record?.bindings ?? {}).map((t) => t.key)).toEqual([
      "actuator",
    ])
  })

  it("refuses a manifest whose bindings name keys it does not have", async () => {
    const nut = await generated("fastener.nut", { size: "M3" })
    const bad = ComponentManifestSchema.safeParse({
      ...nut.def.manifest,
      bindings: [
        {
          key: "x",
          from: { kind: "mass", part: "ghost" },
          to: { kind: "tint", part: "ghost" },
          scale: 1,
          offset: 0,
        },
      ],
    })
    expect(bad.success).toBe(false)
  })
})
