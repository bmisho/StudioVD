import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { err, ok, toAppError, type Result } from "./result"

/** Closes the main window (File > Exit). Needs `core:window:allow-close`. */
export async function closeMainWindow(): Promise<Result<void>> {
  if (!isTauri()) {
    return err({ kind: "unavailable", message: "Close the browser tab to exit." })
  }
  try {
    await getCurrentWindow().close()
    return ok(undefined)
  } catch (e) {
    return err(toAppError(e))
  }
}
