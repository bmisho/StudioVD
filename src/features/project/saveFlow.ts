import { collectGarbage } from "@/core/project/collectGarbage"
import { serializeScene } from "@/core/schema"
import type { ProjectDeps } from "./projectDeps"

export const problemLines = (problems: { path: string; message: string }[]) =>
  problems
    .slice(0, 5)
    .map((p) => `${p.path}: ${p.message}`)
    .join("\n")

/** The name Save As suggests: the file's own, else the project's. */
function suggestedName(deps: ProjectDeps): string {
  const fileName = deps.project.getState().fileName
  return fileName ? fileName.replace(/\.stvd$/i, "") : deps.document.getState().doc.project.name
}

/**
 * Saves the document as it is now (PLAN 5.3, 5.6): unused assets left out, the same checks
 * as opening, a thumbnail when the view can render one. Edits made while the file is written
 * stay unsaved. Asks for a file first when the project has none or `saveAs` is set. Returns
 * whether the project was saved (false when cancelled or failed; failures are reported).
 */
export async function saveDocument(deps: ProjectDeps, saveAs = false): Promise<boolean> {
  const { backend, notify, project } = deps
  let token: string | undefined
  if (saveAs || project.getState().fileName === null) {
    const picked = await backend.pickProjectPath(suggestedName(deps))
    if (!picked.ok) {
      notify.error("Save failed", picked.error.message)
      return false
    }
    if (picked.value === null) return false
    token = picked.value.token
  }
  const doc = deps.document.getState().doc
  const serialized = serializeScene(collectGarbage(doc), deps.appVersion)
  if (!serialized.ok) {
    // A store bug, never user input: refuse to write a file Open would refuse.
    notify.error("Save failed: the project is inconsistent", problemLines(serialized.problems))
    return false
  }
  const thumbnail = await deps.captureThumbnail().catch(() => null)
  const saved = await backend.saveProject(
    new TextEncoder().encode(serialized.json),
    thumbnail,
    token
  )
  if (!saved.ok) {
    notify.error("Save failed", saved.error.message)
    return false
  }
  project.getState().setFileName(saved.value.fileName)
  project.getState().markSaved(deps.now())
  deps.tracker.markSaved(doc)
  return true
}
