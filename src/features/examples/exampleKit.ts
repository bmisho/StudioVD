import { assetFromPrepared } from "@/core/library/assetRecords"
import {
  newId,
  type AnchorId,
  type Binding,
  type MateId,
  type MateType,
  type NodeId,
  type PartId,
  type Vec3,
} from "@/core/schema"
import { generateComponent } from "@/features/library/generatorClient"
import { writeAsset } from "@/lib/tauri/files"
import { useDocumentStore } from "@/store/document/documentStore"

// Building blocks for the example projects (PLAN 13.5): boxes from the box generator (their
// GLBs written to the project like any generated part), hand-placed anchors, mates, blocks,
// wires and bindings, all through the same store actions the user's own edits use.

const store = () => useDocumentStore.getState()

/** A plain part: a box of `size` mm centred at `at`, optionally grounded. */
export async function box(name: string, size: Vec3, at: Vec3, grounded = false): Promise<PartId> {
  const made = await generateComponent("primitive.box", 1, {
    widthMm: size[0],
    heightMm: size[1],
    depthMm: size[2],
  })
  const prepared = Object.values(made.assets)[0]
  if (!prepared) throw new Error("The box generator made nothing.")
  const written = await writeAsset(prepared.id, prepared.glb)
  if (!written.ok) throw new Error(written.error.message)
  const asset = assetFromPrepared(prepared)
  const id = newId<PartId>()
  store().insertEntities({
    assets: [asset],
    parts: [
      {
        id,
        name,
        assetId: asset.id,
        parentId: null,
        pose: { positionMm: at, quaternion: [0, 0, 0, 1] },
        materialId: null,
        grounded,
        visible: true,
        collider: "box",
      },
    ],
  })
  return id
}

/** An anchor on a part, in its frame (z the axis or normal, x square to it). */
export function anchor(part: PartId, name: string, originMm: Vec3, z: Vec3, x: Vec3): AnchorId {
  const id = store().addAnchor({
    partId: part,
    kind: "axial",
    frame: { originMm, z, x },
    source: { kind: "manual" },
    name,
  })
  if (!id) throw new Error(`Anchor ${name} was not added.`)
  return id
}

export function mate(
  type: MateType,
  a: AnchorId,
  b: AnchorId,
  limits?: { min: number; max: number }
): MateId {
  const added = store().addMate({ anchorA: a, anchorB: b, type, flip: false, angleOffsetRad: 0 })
  if (!added.ok) throw new Error(`The mate was refused: ${added.reason}`)
  if (limits) store().updateMate(added.id, { limits })
  return added.id
}

export function block(
  model: string,
  x: number,
  y: number,
  params: Record<string, number | boolean> = {}
): NodeId {
  const id = store().addBlock(model, { x, y })
  if (!id) throw new Error(`No block ${model}.`)
  for (const [key, value] of Object.entries(params)) store().setNodeParam(id, key, value)
  return id
}

export function wire(a: NodeId, ap: string, b: NodeId, bp: string): void {
  const r = store().connectPorts({ node: a, port: ap }, { node: b, port: bp })
  if (r.length < 20) throw new Error(`Wire refused: ${r}`) // a refusal is a short word
}

export function bind(b: Omit<Binding, "id">): void {
  const r = store().addBinding(b)
  if (!r.ok) throw new Error(`Binding refused: ${r.reason}`)
}
