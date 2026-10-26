// Test helper (not app code): the sample document with the test rig as a library component.
import { ComponentManifestSchema } from "../component/manifest"
import type { SceneDocument } from "../document"
import type { ComponentDefKey, ComponentInstanceId, GroupId } from "../ids"
import { componentDefKey } from "../library"
import { libraryFixture } from "./libraryFixtures"
import { sampleDocument, uuid } from "./sampleDocument"

export const SAMPLE_LICENSE_TEXT = "cd".repeat(32)
export const SAMPLE_INSTANCE = uuid(700) as ComponentInstanceId

/**
 * `sampleDocument()` whose rig is instance BRG1 of the generated bearing fixture: its parts,
 * anchors, mate and steel listed by local key and pointing back; the base asset licensed
 * under a text in `licenseTexts`.
 */
export function sampleComponentDocument(): SceneDocument {
  const doc = sampleDocument()
  const manifest = ComponentManifestSchema.parse(libraryFixture("component-generated.valid.json"))
  const sha = "12".repeat(32)
  const key = componentDefKey(
    manifest.identity.id,
    manifest.identity.version,
    sha
  ) as ComponentDefKey
  doc.componentDefs[key] = {
    key,
    id: manifest.identity.id,
    version: manifest.identity.version,
    manifestSha256: sha,
    origin: "generator",
    manifest,
  }
  const group = Object.keys(doc.groups)[0] as GroupId
  const [outer, inner] = Object.values(doc.parts)
  const [outerAxis, innerAxis] = Object.values(doc.anchors)
  const [spin] = Object.values(doc.mates)
  const steel = Object.values(doc.materials).find((m) => m.builtinKey === "std.steel")
  if (!outer || !inner || !outerAxis || !innerAxis || !spin || !steel)
    throw new Error("sample incomplete")
  const id = SAMPLE_INSTANCE
  outer.componentRef = { instance: id, key: "outer" }
  inner.componentRef = { instance: id, key: "inner" }
  outerAxis.source = { kind: "component", instance: id, key: "outerAxis" }
  innerAxis.source = { kind: "component", instance: id, key: "innerAxis" }
  doc.components[id] = {
    id,
    def: key,
    designator: "BRG1",
    groupId: group,
    parts: { outer: outer.id, inner: inner.id },
    anchors: { outerAxis: outerAxis.id, innerAxis: innerAxis.id },
    mates: { spin: spin.id },
    materials: { steel: steel.id },
    bindings: {},
  }
  doc.licenseTexts[SAMPLE_LICENSE_TEXT] = {
    path: `licenses/${SAMPLE_LICENSE_TEXT}.txt`,
    spdx: "MIT",
  }
  const asset = doc.assets[outer.assetId]
  if (!asset) throw new Error("sample incomplete")
  asset.license = {
    spdx: "MIT",
    creators: [{ name: "Example" }],
    licenseText: SAMPLE_LICENSE_TEXT,
    attributionRequired: true,
    redistributable: true,
  }
  return doc
}
