import { describe, expect, it, vi } from "vitest"
import type { SceneDocument } from "@/core/schema"
import { setupProject } from "./projectControllerTestSetup"

const withVersion = (doc: SceneDocument) => ({ ...doc, appVersion: "0.1.0" })

describe("project controller: save and open", () => {
  it("saves an untitled project through Save As, then reopens the same document", async () => {
    const t = setupProject()
    t.insertRig()
    expect(t.project.getState().dirty).toBe(true)
    await t.controller.save()
    expect(t.backend.pickProjectPath).toHaveBeenCalledWith("Untitled")
    expect(t.project.getState()).toMatchObject({
      fileName: "robot.stvd",
      dirty: false,
      savedAt: 1000,
    })
    const saved = t.document.getState().doc

    await t.controller.newProject()
    expect(Object.keys(t.document.getState().doc.parts)).toHaveLength(0)
    await t.controller.open()
    expect(t.document.getState().doc).toEqual(withVersion(saved))
    expect(t.project.getState()).toMatchObject({ fileName: "robot.stvd", dirty: false })
    expect(t.history.canUndo()).toBe(false)
  })

  it("keeps edits made while a save is written unsaved", async () => {
    const t = setupProject()
    t.insertRig()
    let release = () => {}
    const write = t.backend.saveProject.getMockImplementation()
    t.backend.saveProject.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => (release = resolve))
      return write ? write(...args) : Promise.reject(new Error("no fake"))
    })
    const saving = t.controller.save()
    await vi.waitFor(() => expect(t.backend.saveProject).toHaveBeenCalled())
    t.document.getState().createGroup("Late") // lands while the file is written
    release()
    await saving
    expect(t.project.getState().dirty).toBe(true)
    t.history.undo()
    expect(t.project.getState().dirty).toBe(false) // back to exactly what was saved
  })

  it("refuses an inconsistent file and leaves the open project alone", async () => {
    const t = setupProject()
    t.insertRig()
    const before = t.document.getState().doc
    const broken = { ...withVersion(before), parts: { x: 1 } }
    t.disk.set("bad.stvd", new TextEncoder().encode(JSON.stringify(broken)))
    t.nextPick.name = "bad.stvd"
    await t.controller.open()
    expect(t.document.getState().doc).toBe(before)
    expect(t.backend.discardProject).toHaveBeenCalledOnce()
    expect(t.backend.commitProject).not.toHaveBeenCalled()
    expect(t.notify.error).toHaveBeenCalledWith("Could not open bad.stvd", expect.any(String))
  })
})

describe("project controller: unsaved changes", () => {
  it("Cancel keeps the project; Don't Save drops the autosave and goes on", async () => {
    const t = setupProject()
    t.insertRig()
    t.answerNext("cancel")
    await t.controller.newProject()
    expect(Object.keys(t.document.getState().doc.parts)).toHaveLength(2)
    expect(t.backend.newProject).not.toHaveBeenCalled()

    t.answerNext("discard")
    await t.controller.newProject()
    expect(t.backend.clearAutosave).toHaveBeenCalledOnce()
    expect(Object.keys(t.document.getState().doc.parts)).toHaveLength(0)
    expect(t.project.getState().dirty).toBe(false)
  })

  it("Save saves first; a cancelled Save As cancels the whole operation", async () => {
    const t = setupProject()
    t.insertRig()
    t.nextPick.name = null
    t.answerNext("save")
    await t.controller.newProject()
    expect(t.backend.newProject).not.toHaveBeenCalled()
    t.nextPick.name = "kept.stvd"
    t.answerNext("save")
    await t.controller.newProject()
    expect(t.disk.has("kept.stvd")).toBe(true)
    expect(t.backend.newProject).toHaveBeenCalledOnce()
  })

  it("closing the window asks, and only confirms when the user does not cancel", async () => {
    const t = setupProject()
    t.insertRig()
    t.answerNext("cancel")
    await t.controller.requestClose()
    expect(t.backend.acknowledgeClose).toHaveBeenCalledOnce()
    expect(t.backend.confirmClose).not.toHaveBeenCalled()
    t.answerNext("discard")
    await t.controller.requestClose()
    expect(t.backend.clearAutosave).toHaveBeenCalledOnce()
    expect(t.backend.confirmClose).toHaveBeenCalledOnce()
  })

  it("waits for a running import instead of replacing the document under it", async () => {
    const t = setupProject()
    t.imports.getState().open([{ token: "f1", name: "a.stl", size: 1 }])
    t.imports.getState().start()
    await t.controller.newProject()
    expect(t.backend.newProject).not.toHaveBeenCalled()
    expect(t.notify.info).toHaveBeenCalledWith("An import is running", expect.any(String))
  })

  it("opens a launch file that arrives during a save once the save is done", async () => {
    const t = setupProject()
    t.insertRig()
    const saving = t.controller.save()
    await t.controller.openLaunch() // a second launch forwards a file mid-save
    expect(t.backend.openLaunchProject).not.toHaveBeenCalled()
    await saving
    expect(t.backend.openLaunchProject).toHaveBeenCalledOnce()
  })
})
