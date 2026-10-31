// Test helper shared by the command registry tests (not app code).
import { vi } from "vitest"
import type { AppError, Result } from "@/lib/tauri/result"
import { createDocumentStore } from "@/store/document/documentStore"
import { createHistory } from "@/store/document/history"
import { createSessionStore } from "@/store/session/sessionStore"
import { createPreferencesStore } from "@/store/preferences/preferencesStore"
import { createViewportBridge } from "@/features/viewport/viewportBridge"
import { createCommandRegistry } from "./registry"
import type { Backend } from "./types"

export const notImplemented: Extract<Result<void>, { ok: false }> = {
  ok: false,
  error: { kind: "notImplemented", message: "Not available in this test." },
}

/** A registry over fresh stores, a mocked backend and a detached viewport. */
export function setupRegistry(overrides: Partial<Backend> = {}) {
  const document = createDocumentStore()
  const session = createSessionStore()
  const reportError = vi.fn<(e: AppError, action: string) => void>()
  const openDialog = vi.fn()
  const focusMenuBar = vi.fn()
  const backend: Backend = {
    newProject: vi.fn(() => Promise.resolve(notImplemented)),
    openProject: vi.fn(() => Promise.resolve(notImplemented)),
    saveProject: vi.fn(() => Promise.resolve(notImplemented)),
    saveProjectAs: vi.fn(() => Promise.resolve(notImplemented)),
    closeProject: vi.fn(() => Promise.resolve(notImplemented)),
    importFiles: vi.fn(() => Promise.resolve(notImplemented)),
    writeAsset: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    exportScene: vi.fn(() => Promise.resolve(notImplemented)),
    saveAsComponent: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
    closeWindow: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
    ...overrides,
  }
  const history = createHistory(document)
  const preferences = createPreferencesStore(null)
  const viewport = createViewportBridge()
  const registry = createCommandRegistry({
    document,
    history,
    session,
    preferences,
    viewport,
    backend,
    reportError,
    openDialog,
    focusMenuBar,
  })
  return {
    registry,
    document,
    session,
    backend,
    reportError,
    openDialog,
    focusMenuBar,
    history,
    preferences,
    viewport,
  }
}
