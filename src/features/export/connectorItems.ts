import { BufferGeometry, Float32BufferAttribute, Matrix4, Uint32BufferAttribute } from "three"
import { connectorMesh } from "@/core/connectors/connectorMesh"
import { connectorFrames } from "@/core/connectors/frames"
import { connectorAnchors, type SceneDocument } from "@/core/schema"
import { materialCache } from "@/features/viewport/materials/materialCache"
import type { SelectionItem } from "@/store/session/sessionStore"
import type { ExportItem } from "./buildExport"

const NAMES = { belt: "Belt", tube: "Tube", spring: "Spring", cable: "Cable" } as const

/**
 * Belts, tubes and springs for an export (PLAN 9.6): the selected ones, and those hanging
 * only on exported parts (a belt belongs with its pulleys). Their meshes are derived, so they
 * are rebuilt here from the anchors' design frames, in world millimetres.
 */
export function connectorItems(
  doc: SceneDocument,
  selection: readonly SelectionItem[],
  exportedParts: ReadonlySet<string>
): { items: ExportItem[]; dispose: () => void } {
  const picked = new Set<string>(selection.flatMap((s) => (s.kind === "connector" ? [s.id] : [])))
  const items: ExportItem[] = []
  for (const c of Object.values(doc.connectors)) {
    const onExported = connectorAnchors(c).every((id) => {
      const anchor = Object.hasOwn(doc.anchors, id) ? doc.anchors[id] : undefined
      return anchor !== undefined && exportedParts.has(anchor.partId)
    })
    if (!picked.has(c.id) && !onExported) continue
    const frames = connectorFrames(doc, c)
    const mesh = frames && connectorMesh(c, frames)
    if (!mesh) continue
    const geometry = new BufferGeometry()
    geometry.setAttribute("position", new Float32BufferAttribute(mesh.positions, 3))
    geometry.setAttribute("normal", new Float32BufferAttribute(mesh.normals, 3))
    geometry.setIndex(new Uint32BufferAttribute(mesh.indices, 1))
    items.push({
      name: NAMES[c.kind],
      geometry,
      material: materialCache.get(
        c.materialId ? { kind: "material", materialId: c.materialId } : { kind: "default" },
        "shaded",
        doc
      ),
      matrixWorld: new Matrix4(),
    })
  }
  return { items, dispose: () => items.forEach((i) => i.geometry.dispose()) }
}
