// @vitest-environment node
import { describe, expect, it } from "vitest"
import { collectGarbage } from "@/core/project/collectGarbage"
import type { SceneDocument } from "./document"
import type { ComponentInstanceId, GroupId } from "./ids"
import { checkIntegrity } from "./integrity"
import { openSceneBytes, serializeScene } from "./openScene"
import {
  SAMPLE_INSTANCE,
  SAMPLE_LICENSE_TEXT,
  sampleComponentDocument,
} from "./testing/sampleComponent"
import { uuid } from "./testing/sampleDocument"

const paths = (doc: SceneDocument) => checkIntegrity(doc).map((p) => p.path)
const instance = (doc: SceneDocument) => {
  const c = doc.components[SAMPLE_INSTANCE]
  if (!c) throw new Error("no instance")
  return c
}

describe("library components in a project (Phase 9)", () => {
  it("are sound and round-trip through scene.json", () => {
    const doc = sampleComponentDocument()
    expect(paths(doc)).toEqual([])
    const saved = serializeScene(doc, "0.9.0")
    if (!saved.ok) throw new Error(JSON.stringify(saved.problems))
    const opened = openSceneBytes(new TextEncoder().encode(saved.json), "0.9.0")
    expect(opened.ok && opened.document).toEqual({ ...doc, appVersion: "0.9.0" })
  })

  it("refuses entities that do not point back, and back-pointers nothing lists", () => {
    const doc = sampleComponentDocument()
    const outerId = instance(doc).parts.outer
    const outer = outerId && doc.parts[outerId]
    if (!outer) throw new Error("no part")
    outer.componentRef = { instance: SAMPLE_INSTANCE, key: "lid" }
    expect(paths(doc)).toEqual([
      `components.${SAMPLE_INSTANCE}.parts.outer`,
      `parts.${outerId}.componentRef`,
    ])

    const other = sampleComponentDocument()
    const axisId = instance(other).anchors.innerAxis ?? ""
    delete instance(other).anchors.innerAxis
    expect(paths(other)).toEqual([`anchors.${axisId}.source`])
  })

  it("refuses a missing definition or group, a shared group and a repeated designator", () => {
    const doc = sampleComponentDocument()
    const second = uuid(701) as ComponentInstanceId
    doc.components[second] = {
      ...instance(doc),
      id: second,
      parts: {},
      anchors: {},
      mates: {},
      materials: {},
    }
    expect(paths(doc)).toEqual([`components.${second}.groupId`, `components.${second}.designator`])
    instance(doc).def = null
    instance(doc).groupId = uuid(702) as GroupId
    expect(paths(doc)).toContain(`components.${SAMPLE_INSTANCE}.groupId`)
  })

  it("refuses licence texts the bundle lacks; GC keeps only the texts something names", () => {
    const doc = sampleComponentDocument()
    expect(collectGarbage(doc)).toBe(doc) // everything is used
    const gone = { ...doc, licenseTexts: {} }
    expect(paths(gone).some((p) => p.endsWith(".license.licenseText"))).toBe(true)

    const unused = { ...doc, components: {} }
    for (const p of Object.values(unused.parts)) delete p.componentRef
    for (const a of Object.values(unused.anchors)) a.source = { kind: "manual" }
    const collected = collectGarbage(unused)
    expect(Object.keys(collected.componentDefs)).toEqual([]) // no instance uses it
    expect(Object.keys(collected.licenseTexts)).toEqual([SAMPLE_LICENSE_TEXT]) // the asset does
  })
})
