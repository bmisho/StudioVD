import { describe, expect, it, vi } from "vitest"
import { setupProject } from "./projectControllerTestSetup"

type Setup = ReturnType<typeof setupProject>

/** Holds the next scene write until the returned function is called. */
function holdNextSave(t: Setup) {
  let release = () => {}
  const write = t.backend.saveProject.getMockImplementation()
  t.backend.saveProject.mockImplementationOnce(async (...args) => {
    await new Promise<void>((resolve) => (release = resolve))
    return write ? write(...args) : Promise.reject(new Error("no fake"))
  })
  return () => release()
}

const groupsOnDisk = (t: Setup, name: string) => {
  const scene = t.disk.get(name)
  if (!scene) throw new Error(`${name} was never saved`)
  const doc = JSON.parse(new TextDecoder().decode(scene)) as { groups: object }
  return Object.keys(doc.groups).length
}
const groupsShown = (t: Setup) => Object.keys(t.document.getState().doc.groups).length

describe("project controller: reopening the open file", () => {
  it("after choosing Save, keeps the document it just saved", async () => {
    const t = setupProject()
    t.insertRig()
    await t.controller.save() // robot.stvd
    t.document.getState().createGroup("Late")
    const edited = t.document.getState().doc
    t.answerNext("save")
    await t.controller.open() // robot.stvd again, extracted before the save
    expect(t.document.getState().doc).toBe(edited)
    expect(t.project.getState().dirty).toBe(false)
    expect(groupsOnDisk(t, "robot.stvd")).toBe(groupsShown(t))
    expect(t.backend.commitProject).not.toHaveBeenCalled()
  })

  it("with Don't Save, reverts to what the file holds", async () => {
    const t = setupProject()
    t.insertRig()
    await t.controller.save()
    t.document.getState().createGroup("Dropped")
    t.answerNext("discard")
    await t.controller.open()
    expect(groupsShown(t)).toBe(groupsOnDisk(t, "robot.stvd"))
    expect(t.project.getState().dirty).toBe(false)
    expect(t.backend.commitProject).toHaveBeenCalledOnce()
  })
})

describe("project controller: work done during an operation", () => {
  it("asks again when edits were made while the chosen Save was written", async () => {
    const t = setupProject()
    t.insertRig()
    await t.controller.save()
    t.document.getState().createGroup("A")
    let asked = 0
    t.project.subscribe((s, prev) => {
      if (s.prompt && !prev.prompt) asked++
    })
    const release = holdNextSave(t)
    t.answerNext("save")
    const closing = t.controller.requestClose()
    await vi.waitFor(() => expect(t.backend.saveProject).toHaveBeenCalledTimes(2))
    t.document.getState().createGroup("B") // lands while the file is written
    release()
    await vi.waitFor(() => expect(asked).toBe(2))
    expect(t.backend.confirmClose).not.toHaveBeenCalled()
    t.project.getState().prompt?.answer("cancel")
    await closing
    expect(t.backend.confirmClose).not.toHaveBeenCalled()
    expect(t.project.getState().dirty).toBe(true)
  })

  it("closes once the save that was running when the window was closed is done", async () => {
    const t = setupProject()
    t.insertRig()
    const release = holdNextSave(t)
    const saving = t.controller.save()
    await vi.waitFor(() => expect(t.backend.saveProject).toHaveBeenCalled())
    await t.controller.requestClose()
    expect(t.backend.confirmClose).not.toHaveBeenCalled()
    release()
    await saving
    expect(t.backend.confirmClose).toHaveBeenCalledOnce() // saved: nothing left to ask
  })
})
