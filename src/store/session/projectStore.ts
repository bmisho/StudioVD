import { create } from "zustand"
import type { RecoveryCandidate } from "@/lib/tauri/project"

// Session state for the open project (PLAN 5.3, 5.5): not persisted, not undoable.

export type UnsavedChoice = "save" | "discard" | "cancel"

export interface UnsavedPrompt {
  /** What waits on the answer: "closing", "opening robot.stvd", ... */
  action: string
  answer: (choice: UnsavedChoice) => void
}

export interface ProjectState {
  /** `null` while the project has never been saved. */
  fileName: string | null
  /** The document differs from what was last saved (or opened). */
  dirty: boolean
  /** A project operation in progress; others wait (one at a time). */
  busy: "saving" | "opening" | "creating" | null
  savedAt: number | null
  autosavedAt: number | null
  prompt: UnsavedPrompt | null
  /** Crashed sessions offered for recovery (empty when none, or once decided). */
  recovery: RecoveryCandidate[]

  setFileName: (fileName: string | null) => void
  /** Another project became the open one (New, Open, Restore): its own file, no save yet. */
  switched: (fileName: string | null) => void
  setDirty: (dirty: boolean) => void
  setBusy: (busy: ProjectState["busy"]) => void
  markSaved: (at: number) => void
  markAutosaved: (at: number | null) => void
  /** Opens the unsaved-changes prompt; resolves with the user's choice. */
  ask: (action: string) => Promise<UnsavedChoice>
  setRecovery: (candidates: RecoveryCandidate[]) => void
}

export const createProjectStore = () =>
  create<ProjectState>()((set, get) => ({
    fileName: null,
    dirty: false,
    busy: null,
    savedAt: null,
    autosavedAt: null,
    prompt: null,
    recovery: [],

    setFileName: (fileName) => set({ fileName }),
    switched: (fileName) => set({ fileName, savedAt: null, autosavedAt: null }),
    setDirty: (dirty) => set({ dirty }),
    setBusy: (busy) => set({ busy }),
    markSaved: (at) => set({ savedAt: at, autosavedAt: null }),
    markAutosaved: (at) => set({ autosavedAt: at }),
    ask: (action) =>
      new Promise<UnsavedChoice>((resolve) => {
        get().prompt?.answer("cancel") // a newer question replaces an unanswered one
        set({
          prompt: {
            action,
            answer: (choice) => {
              set({ prompt: null })
              resolve(choice)
            },
          },
        })
      }),
    setRecovery: (recovery) => set({ recovery }),
  }))

export type ProjectStore = ReturnType<typeof createProjectStore>

export const useProjectStore = createProjectStore()
