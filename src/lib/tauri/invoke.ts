import { invoke, isTauri, type InvokeArgs } from "@tauri-apps/api/core"
import { err, ok, toAppError, type Result } from "./result"

/**
 * The only path from the UI to Rust (CLAUDE.md §3). Never throws: failures come back as a
 * typed AppError. In a plain browser (`npm run dev`, E2E without mocks) every call returns
 * `unavailable` instead of crashing.
 */
export async function call<T>(command: string, args?: InvokeArgs): Promise<Result<T>> {
  if (!isTauri()) {
    return err({
      kind: "unavailable",
      message: "The desktop backend is not available (running in a plain browser).",
    })
  }
  try {
    return ok(await invoke<T>(command, args))
  } catch (e) {
    return err(toAppError(e))
  }
}
