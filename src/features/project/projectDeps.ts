import type { Notifier } from "@/lib/notify"
import type { PickedFile } from "@/lib/tauri/files"
import type { PendingProject, ProjectInfo } from "@/lib/tauri/project"
import type { Result } from "@/lib/tauri/result"
import type { DocumentStore } from "@/store/document/documentStore"
import type { History } from "@/store/document/history"
import type { ImportStore } from "@/store/session/importStore"
import type { ProjectStore } from "@/store/session/projectStore"
import type { SessionStore } from "@/store/session/sessionStore"
import type { DirtyTracker } from "./dirtyTracker"

/** The Rust project commands the flows use (src/lib/tauri/project.ts; faked in tests). */
export interface ProjectBackend {
  newProject: () => Promise<Result<ProjectInfo>>
  openProjectDialog: () => Promise<Result<PendingProject | null>>
  openRecentProject: (id: string) => Promise<Result<PendingProject>>
  openLaunchProject: () => Promise<Result<PendingProject | null>>
  pendingScene: () => Promise<Result<ArrayBuffer>>
  commitProject: () => Promise<Result<ProjectInfo>>
  discardProject: () => Promise<Result<void>>
  pickProjectPath: (suggestedName: string) => Promise<Result<PickedFile | null>>
  saveProject: (
    scene: Uint8Array,
    thumbnail: Uint8Array | null,
    targetToken?: string
  ) => Promise<Result<ProjectInfo>>
  clearAutosave: () => Promise<Result<void>>
  acknowledgeClose: () => Promise<Result<void>>
  confirmClose: () => Promise<Result<void>>
  restoreRecovery: (token: string) => Promise<Result<PendingProject>>
  discardRecovery: (token: string) => Promise<Result<void>>
}

export interface ProjectDeps {
  backend: ProjectBackend
  document: DocumentStore
  history: History
  session: SessionStore
  imports: ImportStore
  project: ProjectStore
  tracker: DirtyTracker
  /** Frees loaded geometry the new document does not use (New, Open). */
  retainAssets: (ids: ReadonlySet<string>) => void
  fitAll: () => void
  /** A PNG of the assembly for the bundle, or null when the view cannot render one. */
  captureThumbnail: () => Promise<Uint8Array | null>
  /** Resolves once no autosave write is in flight (a save must not race one). */
  autosaveIdle: () => Promise<void>
  notify: Notifier
  appVersion: string
  now: () => number
}
