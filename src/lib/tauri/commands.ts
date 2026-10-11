import { call } from "./invoke"
import type { Result } from "./result"

// Typed wrappers for every Rust command. Command names must match src-tauri/src/commands.

export interface AppInfo {
  name: string
  version: string
  tauriVersion: string
  os: string
  arch: string
}

export const getAppInfo = (): Promise<Result<AppInfo>> => call<AppInfo>("app_info")

// Project lifecycle: stubs in Phase 2 (Rust returns `notImplemented`), real in Phase 5.
export const newProject = (): Promise<Result<void>> => call<void>("project_new")
export const openProject = (): Promise<Result<void>> => call<void>("project_open")
export const saveProject = (): Promise<Result<void>> => call<void>("project_save")
export const saveProjectAs = (): Promise<Result<void>> => call<void>("project_save_as")

// Import, assets and export: see files.ts.
