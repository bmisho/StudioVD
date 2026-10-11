import { convertFileSrc, isTauri } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { call } from "./invoke"
import type { Result } from "./result"

// Import, asset and export commands (src-tauri/src/commands/import.rs). The webview never
// sends a path: dialogs and drops run in Rust, which hands out opaque tokens per file.

/** A file the user picked or dropped: read it through its token. */
export interface PickedFile {
  token: string
  name: string
  size: number
}

export interface DroppedFiles {
  files: PickedFile[]
  /** Names of dropped items that are not importable (folders, other file types). */
  skipped: string[]
}

export const pickImportFiles = (): Promise<Result<PickedFile[]>> =>
  call<PickedFile[]>("pick_import_files")

export const readImportFile = (token: string): Promise<Result<ArrayBuffer>> =>
  call<ArrayBuffer>("read_import_file", { token })

/** A file next to a picked model (.gltf buffers, .obj material library), by relative URI. */
export const readImportResource = (token: string, relative: string): Promise<Result<ArrayBuffer>> =>
  call<ArrayBuffer>("read_import_resource", { token, relative })

/** Stores a normalized asset; Rust checks that `bytes` hash to `id`. False if already there. */
export const writeAsset = (id: string, bytes: Uint8Array): Promise<Result<boolean>> =>
  call<boolean>("write_asset", bytes, { headers: { "x-asset-id": id } })

export interface WorkspaceInfo {
  geometryDir: string
}

export const getWorkspaceInfo = (): Promise<Result<WorkspaceInfo>> =>
  call<WorkspaceInfo>("workspace_info")

/** URL the webview loads an asset from (Tauri asset protocol, scoped to the workspace). */
export const assetUrl = (geometryDir: string, id: string): string =>
  convertFileSrc(`${geometryDir}/${id}.glb`)

/** Save dialog for an export; `null` when the user cancelled. */
export const pickExportPath = (
  format: "glb" | "stl",
  suggestedName: string
): Promise<Result<PickedFile | null>> =>
  call<PickedFile | null>("pick_export_path", { format, suggestedName })

export const writeExport = (token: string, bytes: Uint8Array): Promise<Result<void>> =>
  call<void>("write_export", bytes, { headers: { "x-export-token": token } })

/** Files dropped on the window (Rust registers them and emits `import-drop`). */
export async function onFilesDropped(
  handler: (dropped: DroppedFiles) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined
  return listen<DroppedFiles>("import-drop", (event) => handler(event.payload))
}
