import { useEffect } from "react"
import { isTextInputTarget } from "./keymap"

/**
 * Keys the webview (WebView2, WebKitGTK) would act on as a browser: reload, history and
 * print. In the app a reload throws away unsaved work and Back leaves it, so they are
 * swallowed (Tauri 2 has no switch for WebView2's browser keys). No command may bind them.
 */
export const BROWSER_ONLY_KEYS: ReadonlySet<string> = new Set([
  "F5",
  "Ctrl+F5",
  "Shift+F5",
  "Ctrl+R",
  "Ctrl+Shift+R",
  "Alt+ArrowLeft",
  "Alt+ArrowRight",
  "BrowserBack",
  "BrowserForward",
  "BrowserRefresh",
  "Ctrl+P",
  "Ctrl+Shift+P",
  "Ctrl+U",
])

/**
 * Right clicks open the app's own menus only: the webview's (Back, Refresh, Save as, Print)
 * never shows. Text fields keep theirs (cut, copy, paste). Bubble phase on the window, after
 * React's handlers ran: a menu the app opens on the press is under the pointer by the time
 * Windows sends `contextmenu` on the release, so the 3D view's own guard never sees it.
 */
export function installNativeMenuGuard(target: Window): () => void {
  const onContextMenu = (e: MouseEvent) => {
    if (!isTextInputTarget(e.target)) e.preventDefault()
  }
  target.addEventListener("contextmenu", onContextMenu)
  return () => target.removeEventListener("contextmenu", onContextMenu)
}

export function useNativeMenuGuard(): void {
  useEffect(() => installNativeMenuGuard(window), [])
}
