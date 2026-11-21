import { cleanName } from "@/core/import/importBatch"
import { compose, fromPose, toPose } from "@/core/math/rigid"
import type { EntityBatch } from "@/core/scene/entityBatch"
import {
  newId,
  type Anchor,
  type AnchorId,
  type ComponentDefSnapshot,
  type ComponentInstanceId,
  type Frame,
  type GeometryAsset,
  type GroupId,
  type LicenseText,
  type Mate,
  type MateId,
  type Part,
  type PartId,
  type Pose,
  type SceneDocument,
} from "@/core/schema"
import { componentMaterials } from "./componentMaterials"
import { DEFAULT_PREFIX, nextDesignator } from "./designators"
import { componentBlock } from "./instantiateBlock"
import { componentBindings } from "./instantiateBindings"

/** A fresh copy of a frame (manifests are frozen; documents get their own). */
export const copyFrame = (f: Frame): Frame => ({
  originMm: [f.originMm[0], f.originMm[1], f.originMm[2]],
  z: [f.z[0], f.z[1], f.z[2]],
  x: [f.x[0], f.x[1], f.x[2]],
})

/** A component definition about to be placed, with its stored geometry. */
export interface PlacedComponent {
  def: ComponentDefSnapshot
  /** The scene record of each part's asset, by the manifest's part key. */
  assets: Record<string, GeometryAsset>
  /** Where the component frame goes in the world (mm). */
  pose: Pose
  /** Licence texts its manifest names, already copied into the workspace. */
  licenseTexts?: { sha256: string; text: LicenseText }[]
}

export interface ComponentInsertion {
  batch: EntityBatch
  instance: ComponentInstanceId
  group: GroupId
  designator: string
}

/**
 * A component as document entities (PLAN 4.6): one group named after its designator, the
 * parts at pose ∘ part transform, the anchors and internal mates by local key, its materials
 * (presets shared), the definition's frozen manifest and the instance record that lists them
 * all; each part and anchor names the instance back. Inserted with `insertEntities`, that is
 * ONE undo entry. The root part is grounded when the component is the document's first part
 * and asks for it.
 */
export function instantiateComponent(
  doc: SceneDocument,
  placed: PlacedComponent
): ComponentInsertion {
  const { def } = placed
  const { manifest } = def
  const instance = newId<ComponentInstanceId>()
  const group = newId<GroupId>()
  const designator = nextDesignator(doc, manifest.identity.designatorPrefix ?? DEFAULT_PREFIX)
  const materials = componentMaterials(doc, manifest)
  const frame = fromPose(placed.pose)
  const ground = Object.keys(doc.parts).length === 0 && manifest.placement.groundIfFirst

  const partIds: Record<string, PartId> = {}
  const parts: Part[] = []
  for (const [key, p] of Object.entries(manifest.parts)) {
    const asset = Object.hasOwn(placed.assets, key) ? placed.assets[key] : undefined
    if (!asset) throw new Error(`No geometry for part ${key}.`)
    const id = newId<PartId>()
    partIds[key] = id
    const slots = (p.materialSlots ?? []).flatMap((s) => {
      const materialId = materials.ids[s.material]
      return materialId && asset.slots?.includes(s.slot) ? [{ slot: s.slot, materialId }] : []
    })
    parts.push({
      id,
      name: cleanName(p.name, "Part"),
      assetId: asset.id,
      parentId: group,
      pose: toPose(compose(frame, fromPose(p.transform))),
      materialId: p.material === undefined ? null : (materials.ids[p.material] ?? null),
      grounded: ground && key === manifest.rootPart,
      visible: true,
      collider: p.collider,
      ...(p.mass && { massOverrideKg: p.mass.kg }),
      ...(p.mass?.comMm && { comOverrideMm: [...p.mass.comMm] }),
      ...(slots.length > 0 && { materialSlots: slots }),
      componentRef: { instance, key },
    })
  }

  const anchorIds: Record<string, AnchorId> = {}
  const anchors: Anchor[] = []
  for (const [key, a] of Object.entries(manifest.anchors)) {
    const partId = partIds[a.part]
    if (!partId) continue // the schema already refuses this
    const id = newId<AnchorId>()
    anchorIds[key] = id
    anchors.push({
      id,
      partId,
      kind: a.kind,
      frame: copyFrame(a.frame),
      name: cleanName(a.name, "Anchor"),
      ...(a.interface && { interface: a.interface }),
      source: { kind: "component", instance, key },
    })
  }

  const mateIds: Record<string, MateId> = {}
  const mates: Mate[] = []
  for (const [key, m] of Object.entries(manifest.mates)) {
    const [anchorA, anchorB] = [anchorIds[m.anchorA], anchorIds[m.anchorB]]
    if (!anchorA || !anchorB) continue
    const id = newId<MateId>()
    mateIds[key] = id
    mates.push({
      id,
      type: m.type,
      anchorA,
      anchorB,
      flip: m.flip,
      angleOffsetRad: m.angleOffsetRad,
      ...(m.limits && { limits: { ...m.limits } }),
      contactsEnabled: m.contactsEnabled,
      suppressed: false,
    })
  }

  const assets = [...new Map(Object.values(placed.assets).map((a) => [a.id, a])).values()]
  const block = componentBlock(doc, manifest, instance, designator)
  const blockDef = block
    ? (block.blockDef ?? doc.schematic.blockDefs[block.node.blockDefId])
    : undefined
  const bound = componentBindings(manifest, {
    parts: partIds,
    anchors: anchorIds,
    mates: mateIds,
    ...(block && { node: block.node.id }),
    ...(blockDef && { def: blockDef }),
  })
  return {
    instance,
    group,
    designator,
    batch: {
      assets,
      textures: materials.textures,
      materials: materials.added,
      groups: [
        {
          id: group,
          name: cleanName(`${designator} ${manifest.identity.name}`, designator),
          parentId: null,
        },
      ],
      parts,
      anchors,
      mates,
      componentDefs: [def],
      components: [
        {
          id: instance,
          def: def.key,
          designator,
          groupId: group,
          parts: partIds,
          anchors: anchorIds,
          mates: mateIds,
          materials: materials.ids,
          bindings: bound.byKey,
          ...(block && { nodeId: block.node.id }),
        },
      ],
      licenseTexts: placed.licenseTexts ?? [],
      blockDefs: block?.blockDef ? [block.blockDef] : [],
      schematicNodes: block ? [block.node] : [],
      bindings: bound.bindings,
    },
  }
}
