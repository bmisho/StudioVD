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

/** Files picked or dropped: the importable ones, and the names of the rest. */
export interface ChosenFiles {
  files: PickedFile[]
  /** Items that cannot be imported (folders, other file types, unreadable files). */
  skipped: string[]
}

export const pickImportFiles = (): Promise<Result<ChosenFiles>> =>
  call<ChosenFiles>("pick_import_files")

export const readImportFile = (token: string): Promise<Result<ArrayBuffer>> =>
  call<ArrayBuffer>("read_import_file", { token })

/** A file the picked .gltf (buffers) or .obj (material libraries) names, by that name. */
export const readImportResource = (token: string, relative: string): Promise<Result<ArrayBuffer>> =>
  call<ArrayBuffer>("read_import_resource", { token, relative })

/** Stores a normalized asset; Rust checks that `bytes` hash to `id`. False if already there. */
export const writeAsset = (id: string, bytes: Uint8Array): Promise<Result<boolean>> =>
  call<boolean>("write_asset", bytes, { headers: { "x-asset-id": id } })

/** URL the webview loads an asset from: Rust's `stvd` scheme serves the workspace only. */
export const assetUrl = (id: string): string => convertFileSrc(`${id}.glb`, "stvd")

/** A texture image Rust checked (PNG/JPEG, size, pixels) and stored under its SHA-256. */
export interface ImportedTexture {
  id: string
  ext: "png" | "jpg"
  /** The chosen file's name, for display. */
  name: string
  width: number
  height: number
}

/** Material editor › Choose Image: the dialog and checks run in Rust; `null` if cancelled. */
export const importTexture = (): Promise<Result<ImportedTexture | null>> =>
  call<ImportedTexture | null>("import_texture")

/** URL a texture loads from, through the same `stvd` scheme. */
export const textureUrl = (id: string, ext: string): string =>
  convertFileSrc(`${id}.${ext}`, "stvd")

/** Save dialog for an export; `null` when the user cancelled. */
export const pickExportPath = (
  format: "glb" | "stl" | "svg" | "png" | "csv",
  suggestedName: string
): Promise<Result<PickedFile | null>> =>
  call<PickedFile | null>("pick_export_path", { format, suggestedName })

export const writeExport = (token: string, bytes: Uint8Array): Promise<Result<void>> =>
  call<void>("write_export", bytes, { headers: { "x-export-token": token } })

/**
 * The credits of an STL export (PLAN 9.8): written beside the exported file as
 * `<name>.credits.txt`. Rust derives the path from the export's token; returns the file name.
 */
export const writeExportCredits = (token: string, text: string): Promise<Result<string>> =>
  call<string>("write_export_credits", new TextEncoder().encode(text), {
    headers: { "x-export-token": token },
  })

/** Files dropped on the window (Rust registers them and emits `import-drop`). */
export async function onFilesDropped(handler: (dropped: ChosenFiles) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined
  return listen<ChosenFiles>("import-drop", (event) => handler(event.payload))
}
