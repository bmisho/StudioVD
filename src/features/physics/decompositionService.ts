import { toastNotifier } from "@/lib/notify"
import { decomposeMesh } from "@/lib/tauri/geometry"
import { useSessionStore } from "@/store/session/sessionStore"
import { createDecompositions } from "./decompositions"

/** The app's decompositions: a finished one restarts the running test with the new pieces. */
export const decompositions = createDecompositions({
  decompose: decomposeMesh,
  notify: toastNotifier,
  done: () => useSessionStore.getState().restartTestMode(),
})
