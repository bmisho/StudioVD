import { create } from "zustand"
import { DEFAULT_IMPORT_OPTIONS, type ImportOptions } from "@/core/import/importOptions"
import type { PickedFile } from "@/lib/tauri/files"

// Import dialog and progress: session state (CLAUDE.md §4, kind 2). The options persist for
// the session, so a second import starts from the last choices.

export interface ImportProgress {
  /** Index of the file being processed, of `files.length`. */
  fileIndex: number
  fileName: string
  stage: string
  /** 0..1 within the current file. */
  fraction: number
}

export type ImportStatus =
  | { phase: "idle" }
  | { phase: "options"; files: PickedFile[] }
  | { phase: "running"; files: PickedFile[]; progress: ImportProgress }

export interface ImportState {
  status: ImportStatus
  options: ImportOptions
  /** Opens the dialog for these files; ignored while an import is running. */
  open: (files: PickedFile[]) => void
  setOptions: (patch: Partial<ImportOptions>) => void
  /** Moves to "running" (from "options" only). Returns the files to import. */
  start: () => PickedFile[] | null
  setProgress: (progress: ImportProgress) => void
  /** Back to idle (finished, failed, cancelled or dismissed). */
  close: () => void
}

export function createImportStore() {
  return create<ImportState>()((set, get) => ({
    status: { phase: "idle" },
    options: DEFAULT_IMPORT_OPTIONS,

    open: (files) => {
      if (get().status.phase === "running" || files.length === 0) return
      set({ status: { phase: "options", files } })
    },
    setOptions: (patch) => set((s) => ({ options: { ...s.options, ...patch } })),
    start: () => {
      const status = get().status
      if (status.phase !== "options") return null
      const first = status.files[0]
      set({
        status: {
          phase: "running",
          files: status.files,
          progress: { fileIndex: 0, fileName: first?.name ?? "", stage: "Reading", fraction: 0 },
        },
      })
      return status.files
    },
    setProgress: (progress) =>
      set((s) => (s.status.phase === "running" ? { status: { ...s.status, progress } } : {})),
    close: () => set({ status: { phase: "idle" } }),
  }))
}

export type ImportStore = ReturnType<typeof createImportStore>

export const useImportStore = createImportStore()
