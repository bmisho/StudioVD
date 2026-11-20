import type { StandardView } from "@/core/math/standardViews"
import type { NavigationPresetId } from "@/core/navigation/mousePresets"
import type { ViewportApi } from "@/features/viewport/viewportBridge"
import type { PartId } from "@/core/schema"
import type { AppError, Result } from "@/lib/tauri/result"
import type { History } from "@/store/document/history"
import type { DocumentStore } from "@/store/document/documentStore"
import type { PreferencesStore } from "@/store/preferences/preferencesStore"
import type { DialogId, DisplayMode, SessionStore } from "@/store/session/sessionStore"

export type CommandId =
  | "file.new"
  | "file.open"
  | "file.save"
  | "file.saveAs"
  | "file.close"
  | "file.import"
  | "file.exportGlb"
  | "file.exportStl"
  | "file.exit"
  | "edit.undo"
  | "edit.redo"
  | "edit.delete"
  | "edit.newGroup"
  | "edit.clearSelection"
  | "library.saveAsComponent"
  | "view.fitAll"
  | "view.toggleProjection"
  | "view.toggleSplit"
  | "view.maximizeViewport"
  | "view.maximizeSchematic"
  | "view.toggleLeftPanel"
  | "view.toggleRightPanel"
  | "view.focusMenuBar"
  | "view.toggleVisibility"
  | "view.showAll"
  | "view.isolate"
  | "part.toggleGrounded"
  | "transform.translate"
  | "transform.rotate"
  | `view.orient.${StandardView}`
  | `view.navigation.${NavigationPresetId}`
  | `view.display.${DisplayMode}`
  | "tool.select"
  | "tool.anchor"
  | "tool.mate"
  | "tool.mateApply"
  | "test.toggle"
  | "test.reset"
  | "test.applyPose"
  | "dev.insertTestRig"
  | "help.credits"
  | "help.about"

export interface Command {
  id: CommandId
  label: string
  /** Canonical combos (see keymap.ts), e.g. "Ctrl+Shift+Z". The first one is displayed. */
  shortcuts?: readonly string[]
  /** Whether the shortcut fires while typing in a text field (e.g. Ctrl+S). */
  allowInTextInput?: boolean
  /** Whether holding the shortcut auto-repeats the command (undo/redo). Default false. */
  repeatable?: boolean
  run: () => void | Promise<void>
  isEnabled?: () => boolean
  /** For toggle commands rendered as checkbox items. */
  isChecked?: () => boolean
  /** Shown in the tooltip/menu when the command is not available yet. */
  availableInPhase?: number
  /** What to do to enable it, for the toolbar tooltip ("leave test mode first"). */
  disabledReason?: string
}

/** Backend calls used by commands (src/lib/tauri wrappers; mocked in tests). */
export interface Backend {
  newProject: () => Promise<Result<void>>
  openProject: () => Promise<Result<void>>
  saveProject: () => Promise<Result<void>>
  saveProjectAs: () => Promise<Result<void>>
  /** Closes the project, leaving a new untitled one (asks about unsaved changes). */
  closeProject: () => Promise<Result<void>>
  importFiles: () => Promise<Result<void>>
  /** Stores a normalized asset in the workspace (the test rig's boxes). */
  writeAsset: (id: string, bytes: Uint8Array) => Promise<Result<boolean>>
  exportScene: (format: "glb" | "stl") => Promise<Result<void>>
  /** Opens Save as component for these parts (PLAN 9.7). */
  saveAsComponent: (parts: readonly PartId[]) => Promise<Result<void>>
  closeWindow: () => Promise<Result<void>>
}

export interface CommandDeps {
  document: DocumentStore
  history: History
  session: SessionStore
  preferences: PreferencesStore
  /** The 3D view, once it exists (commands are disabled until then). */
  viewport: ViewportApi
  backend: Backend
  /** Surfaces a failed backend call to the user; `action` names what failed ("Save"). */
  reportError: (error: AppError, action: string) => void
  /** Moves keyboard focus to the menu bar (F10, as on Windows/Linux desktops). */
  focusMenuBar: () => void
  /** Opens a modal dialog owned by the shell. */
  openDialog: (dialog: DialogId) => void
}
