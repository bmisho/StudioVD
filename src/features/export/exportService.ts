import { partsInSelection } from "@/core/scene/partsInSelection"
import type { Part } from "@/core/schema"
import { assetBoxGeometry } from "@/features/viewport/parts/assetBoxGeometry"
import { assetCache } from "@/features/viewport/parts/assetCache"
import { partMaterials } from "@/features/viewport/materials/partMaterials"
import { partObject } from "@/features/viewport/parts/partObjects"
import { pickExportPath, writeExport } from "@/lib/tauri/files"
import { err, ok, type Result } from "@/lib/tauri/result"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { exportGlb, exportStl, type ExportItem } from "./buildExport"

/** File-name stem: no characters Windows or Linux reject (control characters included). */
const fileStem = (name: string) =>
  Array.from(name, (c) => (c < " " || '\\/:*?"<>|'.includes(c) ? "_" : c))
    .join("")
    .trim() || "assembly"

/**
 * The selected parts (a group selects everything below it), else every part. Only parts drawn
 * now are exported: hidden parts are not mounted, so they have no scene object.
 */
function exportItems(): { items: ExportItem[]; parts: Part[] } {
  const { doc } = useDocumentStore.getState()
  const selected = partsInSelection(doc, useSessionStore.getState().selection)
  const parts = Object.values(doc.parts).filter((p) => selected.size === 0 || selected.has(p.id))
  const items: ExportItem[] = []
  const exported: Part[] = []
  for (const part of parts) {
    const object = partObject(part.id)
    const asset = Object.hasOwn(doc.assets, part.assetId) ? doc.assets[part.assetId] : undefined
    if (!object || !asset) continue
    // The pose drawn right now: the design pose, or the live pose in test mode.
    object.updateWorldMatrix(true, false)
    const loaded = assetCache.get(asset.id)
    items.push({
      name: part.name,
      geometry: loaded?.geometry ?? assetBoxGeometry(asset),
      // As drawn when shaded (never the X-ray variant), one material per slot.
      material: partMaterials(part, loaded?.slots ?? null, "shaded", doc),
      matrixWorld: object.matrixWorld.clone(),
    })
    exported.push(part)
  }
  return { items, parts: exported }
}

/** File › Export: GLB (metres) or STL (mm) of the selection or the whole assembly (PLAN 4.9). */
export async function exportScene(format: "glb" | "stl"): Promise<Result<void>> {
  const { items, parts } = exportItems()
  if (items.length === 0)
    return err({ kind: "invalidInput", message: "There are no visible parts to export." })
  const stem = parts.length === 1 && parts[0] ? fileStem(parts[0].name) : "assembly"
  const target = await pickExportPath(format, stem)
  if (!target.ok) return target
  if (target.value === null) return ok(undefined) // cancelled
  try {
    const bytes = format === "glb" ? await exportGlb(items) : exportStl(items)
    return await writeExport(target.value.token, bytes)
  } catch (e) {
    return err({ kind: "internal", message: e instanceof Error ? e.message : String(e) })
  }
}
