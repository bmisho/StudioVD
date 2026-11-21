import { describe, expect, it } from "vitest"
import { instantiateComponent } from "@/core/library/instantiate"
import { at, generated } from "@/core/library/testing/generatedComponent"
import { createTestRig } from "@/core/scene/testRig"
import { checkIntegrity, ComponentManifestSchema, type SceneDocument } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

const validate = (doc: SceneDocument) => checkIntegrity(doc).map((p) => `${p.path}: ${p.message}`)

describe("filling a component's slot (PLAN 13.2)", () => {
  it("binds the slot to the part the user names, once, in one undo entry", async () => {
    const nut = await generated("fastener.nut", { size: "M3" })
    const part = Object.keys(nut.def.manifest.parts)[0] ?? ""
    const manifest = ComponentManifestSchema.parse({
      ...nut.def.manifest,
      schematic: { block: "electrical.switch@1" },
      bindings: [
        {
          key: "actuator",
          from: { kind: "contactSlot", a: part, slot: "Actuator" },
          to: { kind: "param", param: "closed" },
          scale: -1,
          offset: 1,
        },
      ],
    })
    const store = createDocumentStore()
    const s = () => store.getState()
    const rig = createTestRig()
    s().insertEntities(rig)
    const placed = instantiateComponent(s().doc, {
      ...nut,
      def: { ...nut.def, manifest },
      pose: at(0, 0, 0),
    })
    s().insertEntities(placed.batch)
    const own = s().doc.components[placed.instance]?.parts[part]
    const target = rig.parts[0]?.id
    if (!own || !target) throw new Error("setup")
    expect(s().fillComponentSlot(placed.instance, "actuator", own)).toMatch(/outside/)
    const before = store.temporal.getState().pastStates.length
    expect(s().fillComponentSlot(placed.instance, "actuator", target)).toBeNull()
    expect(store.temporal.getState().pastStates.length).toBe(before + 1)
    const id = s().doc.components[placed.instance]?.bindings.actuator
    expect(id && s().doc.bindings[id]?.from).toEqual({ kind: "contact", a: own, b: target })
    expect(s().fillComponentSlot(placed.instance, "actuator", target)).toMatch(/already filled/)
    // Removing the binding opens the slot again, and the document stays one Open accepts.
    if (id) s().deleteBindings([id])
    expect(s().doc.components[placed.instance]?.bindings).toEqual({})
    expect(validate(s().doc)).toEqual([])
  })
})
