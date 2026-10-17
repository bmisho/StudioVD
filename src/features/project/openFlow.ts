import { missingFiles, openSceneBytes, SCHEMA_VERSION } from "@/core/schema"
import type { PendingProject } from "@/lib/tauri/project"
import type { ProjectDeps } from "./projectDeps"
import { problemLines } from "./saveFlow"
import { switchDocument } from "./switchDocument"

/** How the unsaved-changes question ended: nothing left unsaved (clean or Don't Save), saved,
 * or cancelled. */
export type Settled = "proceed" | "saved" | "cancelled"

/**
 * Turns a pending bundle into the open project (PLAN 5.3): its scene goes through the full
 * open pipeline (limits, migrations, schema, integrity) and every file it names must be in
 * the bundle. Only then is the user asked about unsaved changes (`settle`), and only then does
 * Rust swap workspaces. Any refusal leaves the current project untouched. Reopening the file
 * that is open reverts to it, unless the user just saved: then the document is the file.
 */
export async function openPending(
  deps: ProjectDeps,
  pending: PendingProject,
  settle: (action: string) => Promise<Settled>
): Promise<boolean> {
  const { backend, notify } = deps
  const name = pending.fileName ?? "the recovered project"
  const refuse = async (detail: string) => {
    await backend.discardProject()
    notify.error(`Could not open ${name}`, detail)
    return false
  }
  const bytes = await backend.pendingScene()
  if (!bytes.ok) return refuse(bytes.error.message)
  const opened = openSceneBytes(new Uint8Array(bytes.value), deps.appVersion)
  if (!opened.ok) {
    const details = problemLines(opened.problems)
    return refuse(details ? `${opened.message}\n${details}` : opened.message)
  }
  const missing = missingFiles(opened.document, new Set(pending.files))
  if (missing.length > 0)
    return refuse(`Files are missing from it:\n${missing.slice(0, 5).join("\n")}`)
  const settled = await settle(`opening ${name}`)
  if (settled === "cancelled" || (settled === "saved" && pending.sameFile)) {
    // Cancelled; or saved into this very file, so the document is what it holds now and the
    // extraction is older.
    await backend.discardProject()
    return settled === "saved"
  }
  const committed = await backend.commitProject()
  if (!committed.ok) return refuse(committed.error.message)
  switchDocument(deps, opened.document, !pending.recovered)
  deps.project.getState().switched(committed.value.fileName)
  if (opened.fromVersion < SCHEMA_VERSION)
    notify.info(`${name} was upgraded`, "Saving it writes the current file format.")
  for (const warning of opened.warnings) notify.warning(`Opening ${name}`, warning)
  return true
}
