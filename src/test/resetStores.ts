import { APP_VERSION } from "@/core/app-info"
import { createEmptyDocument } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { DEFAULT_PREFERENCES, usePreferencesStore } from "@/store/preferences/preferencesStore"
import { endAnchorTarget } from "@/store/session/anchorTargetStore"
import { initialSessionState, useSessionStore } from "@/store/session/sessionStore"

/** Resets the app-wide singleton stores between component tests. */
export function resetStores(): void {
  useDocumentStore.setState({ doc: createEmptyDocument(APP_VERSION) })
  useDocumentStore.temporal.getState().clear()
  useSessionStore.setState({ ...initialSessionState })
  usePreferencesStore.setState({ ...DEFAULT_PREFERENCES })
  endAnchorTarget()
}
