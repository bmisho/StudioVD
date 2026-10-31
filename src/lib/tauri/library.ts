import { convertFileSrc } from "@tauri-apps/api/core"
import { call } from "./invoke"
import type { Result } from "./result"

// The local component library (PLAN 4.5, 9.2): src-tauri/src/commands/library.rs.

export type LibraryOrigin = "official" | "user" | "sideloaded"

/** An installed component; its manifest text is validated here (zod) before it is used. */
export interface LibraryEntry {
  id: string
  version: string
  manifestSha256: string
  origin: LibraryOrigin
  /** Vouched for by a signed catalog (Phase 14); Install from file never is. */
  verified: boolean
  manifest: string
}

/** A pack extracted and checked by Rust, waiting for validation and confirmation. */
export interface StagedPack {
  token: string
  components: { id: string; version: string; manifestSha256: string; manifest: string }[]
  files: number
  bytes: number
  verified: boolean
}

export const listLibrary = (): Promise<Result<LibraryEntry[]>> =>
  call<LibraryEntry[]>("library_list")

/** Install from file: a dialog, then Rust's checks. Null when cancelled. */
export const pickPack = (): Promise<Result<StagedPack | null>> =>
  call<StagedPack | null>("library_pick_pack")

export const commitInstall = (token: string): Promise<Result<LibraryEntry[]>> =>
  call<LibraryEntry[]>("library_install_commit", { token })

export const cancelInstall = (token: string): Promise<Result<void>> =>
  call<void>("library_install_cancel", { token })

export const removeComponent = (id: string, version: string): Promise<Result<LibraryEntry[]>> =>
  call<LibraryEntry[]>("library_remove", { id, version })

/** Insertion: the component's files into the project workspace; how many were new. */
export const copyComponentIntoProject = (id: string, version: string): Promise<Result<number>> =>
  call<number>("library_copy_into_project", { id, version })

/** This installation's namespace for the user's own components (`u-` + six characters). */
export const userNamespace = (): Promise<Result<string>> => call<string>("library_user_namespace")

/** Save as component: the byte sizes of project GLBs (`geometry/<sha256>.glb`). */
export const projectGeometrySizes = (files: string[]): Promise<Result<number[]>> =>
  call<number[]>("library_project_geometry_sizes", { files })

/**
 * Save as component and Add to my library: a component.json built (and validated) here, its
 * files taken from the project. Returns the whole library.
 */
export const addFromProject = (manifest: string): Promise<Result<LibraryEntry[]>> =>
  call<LibraryEntry[]>("library_add_from_project", { manifest })

export interface ExportSummary {
  components: number
  files: number
  bytes: number
}

/** Export pack…: a save dialog in Rust, then the pack. Null when cancelled. */
export const exportPack = (
  components: { id: string; version: string }[],
  suggestedName: string
): Promise<Result<ExportSummary | null>> =>
  call<ExportSummary | null>("library_export_pack", { components, suggestedName })

/** URL of a library blob (geometry, texture, thumbnail) through the `stvd` scheme. */
export const libraryFileUrl = (sha256: string, ext: "glb" | "png" | "jpg"): string =>
  convertFileSrc(`lib-${sha256}.${ext}`, "stvd")
