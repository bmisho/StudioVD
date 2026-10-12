import { useEffect } from "react"
import { startProjectSession } from "./projectService"

let started = false

/**
 * Starts the project session once per page (StrictMode mounts effects twice): the launch
 * file, crash recovery, and the close and open-file events from Rust.
 */
export function useProjectSession(): void {
  useEffect(() => {
    if (started) return
    started = true
    void startProjectSession()
  }, [])
}
