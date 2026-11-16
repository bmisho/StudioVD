import { creditsText, glbCredits, projectCredits } from "@/core/library/credits"
import { partsInSelection } from "@/core/scene/partsInSelection"
import type { Part } from "@/core/schema"
import { assetBoxGeometry } from "@/features/viewport/parts/assetBoxGeometry"
import { assetCache } from "@/features/viewport/parts/assetCache"
import { partMaterials } from "@/features/viewport/materials/partMaterials"
import { partObject } from "@/features/viewport/parts/partObjects"
import { pickExportPath, writeExport, writeExportCredits } from "@/lib/tauri/files"
import { err, ok, type Result } from "@/lib/tauri/result"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { exportGlb, exportStl, type ExportItem } from "./buildExport"
import { connectorItems } from "./connectorItems"

/** File-name stem: no characters Windows or Linux reject (control characters included). */
const fileStem = (name: string) =>
  Array.from(name, (c) => (c < " " || '\\/:*?"<>|'.includes(c) ? "_" : c))
    .join("")
    .trim() || "assembly"

/**
 * The selected parts (a group selects everything below it), else every part. Only parts drawn
 * now are exported: hidden parts are not mounted, so they have no scene object.
 */
function exportItems(): { items: ExportItem[]; parts: Part[]; dispose: () => void } {
  const { doc } = useDocumentStore.getState()
  const { selection } = useSessionStore.getState()
  const selected = partsInSelection(doc, selection)
  // Nothing selected: everything. Only belts, tubes or springs selected: just those.
  const everything = selected.size === 0 && !selection.some((s) => s.kind === "connector")
  const parts = Object.values(doc.parts).filter((p) => everything || selected.has(p.id))
  const items: ExportItem[] = []
  const exported: Part[] = []
  for (const part of parts) {
    const object = partObject(part.id)
    const asset = Object.hasOwn(doc.assets, part.assetId) ? doc.assets[part.assetId] : undefined
    if (!object || !asset) continue
    // The pose drawn right now: the design pose, or the live pose in test mode.
    object.updateWorldMatrix(true, false)
    const loaded = assetCache.getFor(asset)
    items.push({
      name: part.name,
      geometry: loaded?.geometry ?? assetBoxGeometry(asset),
      // As drawn when shaded (never the X-ray variant), one material per slot.
      material: partMaterials(part, loaded?.slots ?? null, "shaded", doc),
      matrixWorld: object.matrixWorld.clone(),
    })
    exported.push(part)
  }
  const connectors = connectorItems(doc, selection, new Set(exported.map((p) => p.id)))
  items.push(...connectors.items)
  return { items, parts: exported, dispose: connectors.dispose }
}

/** File › Export: GLB (metres) or STL (mm) of the selection or the whole assembly (PLAN 4.9). */
export async function exportScene(format: "glb" | "stl"): Promise<Result<void>> {
  const { items, parts, dispose } = exportItems()
  try {
    if (items.length === 0)
      return err({ kind: "invalidInput", message: "There are no visible parts to export." })
    const only = items.length === 1 ? items[0] : undefined
    const stem = only ? fileStem(only.name) : "assembly"
    const target = await pickExportPath(format, stem)
    if (!target.ok) return target
    if (target.value === null) return ok(undefined) // cancelled
    // Attribution travels with every export (PLAN 4.8): inside a GLB, beside an STL.
    const { doc } = useDocumentStore.getState()
    const credits = projectCredits(
      doc,
      parts.map((p) => p.id)
    )
    const bytes = format === "glb" ? await exportGlb(items, glbCredits(credits)) : exportStl(items)
    const written = await writeExport(target.value.token, bytes)
    if (!written.ok || format === "glb" || credits.length === 0) return written
    const sidecar = await writeExportCredits(
      target.value.token,
      creditsText(credits, target.value.name)
    )
    return sidecar.ok ? ok(undefined) : sidecar
  } catch (e) {
    return err({ kind: "internal", message: e instanceof Error ? e.message : String(e) })
  } finally {
    dispose()
  }
}
