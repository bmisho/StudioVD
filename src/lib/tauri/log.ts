import { call } from "./invoke"

// The log file (PLAN 15.5): src-tauri/src/logging.rs. The webview reports what it cannot
// handle; Rust writes it as one bounded line. Never awaited, never throws.

/** Writes an uncaught error to the app's log file (a no-op in a plain browser). */
export function logError(where: string, error: unknown): void {
  const detail =
    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error)
  void call<void>("log_webview_error", { message: `${where}: ${detail}`.slice(0, 8192) })
}

/** Uncaught errors and unhandled rejections anywhere in the page go to the log. */
export function logUncaughtErrors(target: Pick<Window, "addEventListener"> = window): void {
  target.addEventListener("error", (e) => logError("uncaught", e.error ?? e.message))
  target.addEventListener("unhandledrejection", (e) => logError("unhandled rejection", e.reason))
}
