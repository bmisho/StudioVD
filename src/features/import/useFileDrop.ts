import { useEffect } from "react"
import { listenForDroppedFiles } from "./importService"

/** Files dropped on the window open the import dialog (Rust turns them into tokens). */
export function useFileDrop(): void {
  useEffect(() => {
    let unlisten: (() => void) | null = null
    let disposed = false
    void listenForDroppedFiles().then((fn) => {
      if (disposed) fn()
      else unlisten = fn
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])
}
