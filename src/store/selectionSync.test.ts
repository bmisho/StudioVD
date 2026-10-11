import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { createDocumentStore } from "./document/documentStore"
import { createHistory } from "./document/history"
import { createSessionStore } from "./session/sessionStore"
import { connectSelectionPruning } from "./selectionSync"

describe("selection pruning", () => {
  it("drops selected entities that undo removed, and nothing else", () => {
    const document = createDocumentStore()
    const session = createSessionStore()
    const history = createHistory(document)
    const stop = connectSelectionPruning(document, session)

    const kept = document.getState().createGroup("Kept")
    const undone = document.getState().createGroup("Undone")
    session.getState().select([
      { kind: "group", id: kept },
      { kind: "group", id: undone },
    ])
    history.undo()
    expect(session.getState().selection).toEqual([{ kind: "group", id: kept }])

    stop()
    history.undo()
    expect(session.getState().selection).toEqual([{ kind: "group", id: kept }]) // unsubscribed
  })
})

describe("selection pruning with inserted entities", () => {
  it("drops selected rig parts when the insert is undone", () => {
    const document = createDocumentStore()
    const session = createSessionStore()
    const history = createHistory(document)
    const stop = connectSelectionPruning(document, session)
    const rig = createTestRig()
    document.getState().insertEntities(rig)
    session.getState().select(rig.parts.map((p) => ({ kind: "part" as const, id: p.id })))
    history.undo()
    expect(session.getState().selection).toEqual([])
    stop()
  })
})
