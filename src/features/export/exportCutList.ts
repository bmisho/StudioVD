import { cutList, cutListCsv } from "@/core/connectors/cutList"
import { pickExportPath, writeExport } from "@/lib/tauri/files"
import { err, ok, type Result } from "@/lib/tauri/result"
import { useDocumentStore } from "@/store/document/documentStore"

/** File › Export › Cable cut list (PLAN 16.3): every cable's colour, size and length as CSV. */
export async function exportCutList(): Promise<Result<void>> {
  const { doc } = useDocumentStore.getState()
  const rows = cutList(doc)
  if (rows.length === 0)
    return err({ kind: "invalidInput", message: "The project has no cables to list." })
  const stem = doc.project.name.trim() || "project"
  const target = await pickExportPath("csv", `${stem} cut list`)
  if (!target.ok) return target
  if (target.value === null) return ok(undefined) // cancelled
  return writeExport(target.value.token, new TextEncoder().encode(cutListCsv(rows)))
}
