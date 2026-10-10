import { APP_VERSION } from "@/core/app-info"
import { createEmptyDocument } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { initialSessionState, useSessionStore } from "@/store/session/sessionStore"

/** Resets the app-wide singleton stores between component tests. */
export function resetStores(): void {
  useDocumentStore.setState({ doc: createEmptyDocument(APP_VERSION) })
  useDocumentStore.temporal.getState().clear()
  useSessionStore.setState({ ...initialSessionState })
}
