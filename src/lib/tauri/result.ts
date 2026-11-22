/** Error kinds shared with Rust `AppError` (src-tauri/src/error.rs). Keep both in sync. */
export const APP_ERROR_KINDS = [
  "notImplemented",
  "unavailable",
  "invalidInput",
  "io",
  "network",
  "cancelled",
  "internal",
] as const
export type AppErrorKind = (typeof APP_ERROR_KINDS)[number]

export interface AppError {
  kind: AppErrorKind
  message: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const err = <T = never>(error: AppError): Result<T> => ({ ok: false, error })

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

/** Normalizes anything thrown by `invoke` (Rust AppError JSON, strings, Errors) into AppError. */
export function toAppError(e: unknown): AppError {
  if (isRecord(e) && typeof e.kind === "string" && typeof e.message === "string") {
    const kind = (APP_ERROR_KINDS as readonly string[]).includes(e.kind)
      ? (e.kind as AppErrorKind)
      : "internal"
    return { kind, message: e.message }
  }
  if (typeof e === "string") return { kind: "internal", message: e }
  if (e instanceof Error) return { kind: "internal", message: e.message }
  return { kind: "internal", message: "Unknown error" }
}
