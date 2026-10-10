import type { AppError, Result } from "@/lib/tauri/result"
import type { History } from "@/store/document/history"
import type { DocumentStore } from "@/store/document/documentStore"
import type { SessionStore } from "@/store/session/sessionStore"

export type CommandId =
  | "file.new"
  | "file.open"
  | "file.save"
  | "file.saveAs"
  | "file.import"
  | "file.exportGlb"
  | "file.exportStl"
  | "file.exit"
  | "edit.undo"
  | "edit.redo"
  | "edit.delete"
  | "edit.newGroup"
  | "edit.clearSelection"
  | "view.fitAll"
  | "view.toggleProjection"
  | "view.toggleSplit"
  | "view.maximizeViewport"
  | "view.maximizeSchematic"
  | "view.toggleLeftPanel"
  | "view.toggleRightPanel"
  | "tool.select"
  | "tool.anchor"
  | "tool.mate"
  | "test.toggle"
  | "help.about"

export interface Command {
  id: CommandId
  label: string
  /** Canonical combos (see keymap.ts), e.g. "Ctrl+Shift+Z". The first one is displayed. */
  shortcuts?: readonly string[]
  /** Whether the shortcut fires while typing in a text field (e.g. Ctrl+S). */
  allowInTextInput?: boolean
  run: () => void | Promise<void>
  isEnabled?: () => boolean
  /** For toggle commands rendered as checkbox items. */
  isChecked?: () => boolean
  /** Shown in the tooltip/menu when the command is not available yet. */
  availableInPhase?: number
}

/** Backend calls used by commands (src/lib/tauri wrappers; mocked in tests). */
export interface Backend {
  newProject: () => Promise<Result<void>>
  openProject: () => Promise<Result<void>>
  saveProject: () => Promise<Result<void>>
  saveProjectAs: () => Promise<Result<void>>
  importFiles: () => Promise<Result<void>>
  exportScene: (format: "glb" | "stl") => Promise<Result<void>>
  closeWindow: () => Promise<Result<void>>
}

export interface CommandDeps {
  document: DocumentStore
  history: History
  session: SessionStore
  backend: Backend
  /** Surfaces a failed backend call to the user (toast in the app). */
  reportError: (error: AppError) => void
  /** Opens a modal dialog owned by the shell. */
  openDialog: (dialog: "about") => void
}
