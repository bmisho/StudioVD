import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import { SceneGraphPanel } from "./SceneGraphPanel"

describe("SceneGraphPanel", () => {
  beforeEach(resetStores)

  it("its Delete button follows Edit › Delete, anchors included", () => {
    const rig = createTestRig()
    useDocumentStore.getState().insertEntities(rig)
    const [hinge] = rig.anchors
    if (!hinge) throw new Error("rig incomplete")
    render(<SceneGraphPanel />)
    const trash = screen.getByRole("button", { name: "Delete selected" })
    expect(trash).toHaveAttribute("aria-disabled", "true")
    expect(trash).toHaveAttribute("title", "Delete: select parts, groups or anchors first")

    act(() => useSessionStore.getState().select([{ kind: "anchor", id: hinge.id }]))
    expect(trash).toHaveAttribute("aria-disabled", "false")
    fireEvent.click(trash)
    expect(Object.hasOwn(useDocumentStore.getState().doc.anchors, hinge.id)).toBe(false)
  })
})
