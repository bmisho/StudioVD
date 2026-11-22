import { Channel, convertFileSrc } from "@tauri-apps/api/core"
import { call } from "./invoke"
import type { StagedPack } from "./library"
import type { Result } from "./result"

// The online catalog (PLAN 14.3, 14.5): src-tauri/src/commands/catalog.rs. Network use happens
// only in Refresh and Download, on the user's action; status reads the verified cache.

export interface CatalogStatus {
  /** This build has a signed catalog to fetch (keys and hosts compiled in). */
  configured: boolean
  /** The hosts network use reaches, for the consent dialog. */
  hosts: string[]
  offline: boolean
  consented: boolean
  /** The cached index text, verified by Rust; validated here before use. */
  index: string | null
  /** Seconds since 1970 of the last refresh. */
  fetchedAt: number | null
  /** Past its expiry: browsing works, installing refreshes first. */
  expired: boolean
}

export interface CatalogRefresh {
  status: CatalogStatus
  changed: boolean
  previewsFailed: number
}

export interface DownloadProgress {
  done: number
  total: number
}

export interface DiskUsage {
  store: number
  catalogs: number
  downloads: number
}

export const catalogStatus = (): Promise<Result<CatalogStatus>> =>
  call<CatalogStatus>("catalog_status")

export const refreshCatalog = (): Promise<Result<CatalogRefresh>> =>
  call<CatalogRefresh>("catalog_refresh")

/** Downloads and stages one pack the index lists (by its SHA-256); commit as for a file. */
export function downloadPack(
  pack: string,
  onProgress: (p: DownloadProgress) => void
): Promise<Result<StagedPack>> {
  const channel = new Channel<DownloadProgress>()
  channel.onmessage = onProgress
  return call<StagedPack>("catalog_download", { pack, onProgress: channel })
}

export const cancelDownload = (pack: string): Promise<Result<boolean>> =>
  call<boolean>("catalog_cancel", { pack })

export const libraryDiskUsage = (): Promise<Result<DiskUsage>> =>
  call<DiskUsage>("library_disk_usage")

/** A catalog thumbnail (`catalogs/thumbs/<sha256>.png`) through the `stvd` scheme. */
export const catalogThumbUrl = (sha256: string): string =>
  convertFileSrc(`cat-${sha256}.png`, "stvd")
