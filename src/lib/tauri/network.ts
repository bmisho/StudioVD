import { call } from "./invoke"
import type { Result } from "./result"

// Settings › Network (PLAN 4.7, 14.4): src-tauri/src/commands/network.rs. Per machine, kept
// by Rust (it does the networking); the webview never sees a path or makes a request.

export type ProxySetting =
  { mode: "system" } | { mode: "none" } | { mode: "manual"; url: string; bypass: string }

export interface NetworkSettings {
  offline: boolean
  consented: boolean
  proxy: ProxySetting
  /** An https:// base URL holding the same files as the official hosts. */
  mirror: string | null
  weeklyCheck: boolean
  /** Set by Rust only. */
  lastCheck: number | null
  /** The extra CA's file name and certificate count; set by Rust only. */
  extraCa: string | null
}

export interface NetworkView {
  settings: NetworkSettings
  hosts: string[]
  /** Where the system proxy comes from on this platform. */
  systemProxy: string
  /** The proxy the settings resolve to now, as text. */
  proxyInUse: string
}

export interface HostCheck {
  host: string
  ok: boolean
  message: string
}

export const networkSettings = (): Promise<Result<NetworkView>> =>
  call<NetworkView>("network_settings")

export const saveNetworkSettings = (settings: NetworkSettings): Promise<Result<NetworkView>> =>
  call<NetworkView>("network_save", { settings })

/** A dialog in Rust; null when cancelled. */
export const pickExtraCa = (): Promise<Result<NetworkView | null>> =>
  call<NetworkView | null>("network_pick_ca")

export const clearExtraCa = (): Promise<Result<NetworkView>> =>
  call<NetworkView>("network_clear_ca")

export const testConnection = (): Promise<Result<HostCheck[]>> => call<HostCheck[]>("network_test")
