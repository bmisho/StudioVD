import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ok, type Result } from "@/lib/tauri/result"
import { createDocumentStore } from "@/store/document/documentStore"
import { createHistory } from "@/store/document/history"
import { createProjectStore } from "@/store/session/projectStore"
import { createAutosaver } from "./autosaver"
import { createDirtyTracker } from "./dirtyTracker"

function setup() {
  const document = createDocumentStore()
  const history = createHistory(document)
  const project = createProjectStore()
  const tracker = createDirtyTracker(document, project, vi.fn())
  const calls: string[] = []
  let release: () => void = () => undefined
  const write = vi.fn(async (): Promise<Result<void>> => {
    calls.push("write:start")
    await new Promise<void>((resolve) => (release = resolve))
    calls.push("write:end")
    return ok(undefined)
  })
  const clear = vi.fn((): Promise<Result<void>> => {
    calls.push("clear")
    return Promise.resolve(ok(undefined))
  })
  const autosaver = createAutosaver({
    document,
    history,
    project,
    tracker,
    write,
    clear,
    appVersion: "0.1.0",
    now: () => Date.now(),
  })
  return {
    document,
    history,
    project,
    tracker,
    write,
    clear,
    calls,
    autosaver,
    release: () => release(),
  }
}

describe("autosaver", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("writes a moment after editing stops, not on every change", async () => {
    const t = setup()
    t.document.getState().createGroup("A")
    await vi.advanceTimersByTimeAsync(1000)
    t.document.getState().createGroup("B")
    await vi.advanceTimersByTimeAsync(1500)
    expect(t.write).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(600)
    expect(t.write).toHaveBeenCalledOnce()
    t.release()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.project.getState().autosavedAt).not.toBeNull()
  })

  it("waits for a gesture or a project operation to finish", async () => {
    const t = setup()
    const token = t.history.beginGesture()
    t.document.getState().createGroup("Dragging")
    await vi.advanceTimersByTimeAsync(5000)
    expect(t.write).not.toHaveBeenCalled()
    t.history.endGesture(token)
    t.project.getState().setBusy("saving")
    await vi.advanceTimersByTimeAsync(5000)
    expect(t.write).not.toHaveBeenCalled()
    t.project.getState().setBusy(null)
    await vi.advanceTimersByTimeAsync(2100)
    expect(t.write).toHaveBeenCalledOnce()
  })

  it("removes the autosave only after a write still in flight has landed", async () => {
    const t = setup()
    t.document.getState().createGroup("Edit")
    await vi.advanceTimersByTimeAsync(2100)
    expect(t.calls).toEqual(["write:start"])
    t.history.undo() // back at the saved document while the write is still running
    await vi.advanceTimersByTimeAsync(0)
    expect(t.calls).toEqual(["write:start"])
    t.release()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.calls).toEqual(["write:start", "write:end", "clear"])
    await t.autosaver.idle()
    expect(t.project.getState().autosavedAt).toBeNull()
  })

  it("writes again when a save leaves the shown document unsaved", async () => {
    const t = setup()
    t.document.getState().createGroup("Edit")
    const edited = t.document.getState().doc
    await vi.advanceTimersByTimeAsync(2100)
    t.release()
    await vi.advanceTimersByTimeAsync(0)
    t.history.undo() // during Save, which wrote `edited`: back at the old saved document
    await vi.advanceTimersByTimeAsync(0)
    t.tracker.markSaved(edited) // the save lands: the file holds `edited`, not what is shown
    expect(t.project.getState().dirty).toBe(true)
    await vi.advanceTimersByTimeAsync(2100)
    expect(t.write).toHaveBeenCalledTimes(2)
  })
})
