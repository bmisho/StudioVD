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

// Projects: see project.ts. Import, assets and export: see files.ts.
